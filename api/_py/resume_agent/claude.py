"""Calls Claude for one structured answer (the draft or a revision).

Uses structured outputs (output_config.format) so the answer parses against
the schema. Forced tool_choice is not used: current models reject it.
Streams, so long drafts do not hit HTTP timeouts.

Not every account accepts every option, so a request the API rejects (400,
403 or 404) is retried with less: first without the refusal-fallback beta,
then asking for JSON in the prompt instead of structured outputs, then on
RESUME_BACKUP_MODEL. Each rejection's reason is kept in the error detail.
"""
import json
import os

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class ClaudeError(Exception):
    """`code` is one of: unavailable, refused, truncated, rate_limited, overloaded, error."""

    def __init__(self, code, message=""):
        super().__init__(message or code)
        self.code = code


def model_name():
    return os.environ.get("RESUME_MODEL") or "claude-opus-5-5"


def backup_model():
    return os.environ.get("RESUME_BACKUP_MODEL") or "claude-sonnet-5-5"


def _attempts():
    """(model, use refusal fallback, use structured outputs), most capable first."""
    model, backup = model_name(), backup_model()
    fallbacks = os.environ.get("RESUME_FALLBACKS", "on") != "off" and not model.startswith("claude-haiku")
    out = []
    if fallbacks:
        out.append((model, True, True))
    out += [(model, False, True), (model, False, False)]
    if backup and backup != model:
        out += [(backup, False, True), (backup, False, False)]
    return out


def _answer_text(msg):
    """Text of the final answer. After a refusal fallback, only what the last model wrote."""
    blocks = list(msg.content)
    last_switch = max((i for i, b in enumerate(blocks) if getattr(b, "type", "") == "fallback"), default=-1)
    return "".join(b.text for b in blocks[last_switch + 1:] if getattr(b, "type", "") == "text").strip()


def _parse(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Without structured outputs the JSON can come wrapped in a sentence or a code fence.
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


def ask_structured(system, prompt, schema, max_tokens=32000):
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        raise ClaudeError("unavailable", "ANTHROPIC_API_KEY is not set.")
    import anthropic

    client = anthropic.Anthropic(max_retries=2, timeout=280)
    rejected = []
    for model, fallbacks, structured in _attempts():
        output_config = {"effort": os.environ.get("RESUME_EFFORT") or "medium"}
        sys_text = system
        if structured:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        else:
            sys_text = (system + "\n\nRespond with one JSON object only, no other text, matching this JSON Schema:\n"
                        + json.dumps(schema, separators=(",", ":")))
        params = dict(model=model, max_tokens=max_tokens, system=sys_text,
                      messages=[{"role": "user", "content": prompt}], output_config=output_config)
        try:
            if fallbacks:
                # Server-side refusal fallback: a declined request is re-run on a fallback model.
                with client.beta.messages.stream(**params, betas=[FALLBACK_BETA], fallbacks="default") as s:
                    msg = s.get_final_message()
            else:
                with client.messages.stream(**params) as s:
                    msg = s.get_final_message()
        except (anthropic.BadRequestError, anthropic.NotFoundError, anthropic.PermissionDeniedError) as e:
            rejected.append(f"{model}{' +fallbacks' if fallbacks else ''}{'' if structured else ' (prompted JSON)'}: {e.status_code} {e.message}")
            continue
        except anthropic.AuthenticationError as e:
            raise ClaudeError("error", f"The Anthropic API key was rejected: {e.message}") from e
        except anthropic.RateLimitError as e:
            raise ClaudeError("rate_limited", str(e)) from e
        except anthropic.InternalServerError as e:
            raise ClaudeError("overloaded", str(e)) from e
        except anthropic.APIStatusError as e:
            raise ClaudeError("error", f"{e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise ClaudeError("error", f"Could not reach the Anthropic API: {e}") from e

        if msg.stop_reason == "refusal":
            raise ClaudeError("refused", "The model declined this request.")
        if msg.stop_reason == "max_tokens":
            raise ClaudeError("truncated", "The answer was cut off.")
        try:
            out = _parse(_answer_text(msg))
        except json.JSONDecodeError:
            rejected.append(f"{model}: the answer was not valid JSON")
            continue
        if isinstance(out, dict):
            return out
        rejected.append(f"{model}: the answer was not a JSON object")
    raise ClaudeError("error", " | ".join(rejected)[:1500] or "No answer.")
