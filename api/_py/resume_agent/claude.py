"""Calls Claude for one structured answer (the draft or a revision).

Uses structured outputs (output_config.format) so the answer always parses
against the schema. Forced tool_choice is not used: current models reject it.
Streams, so long drafts do not hit HTTP timeouts.
"""
import json
import os


class ClaudeError(Exception):
    """`code` is one of: unavailable, refused, truncated, rate_limited, overloaded, error."""

    def __init__(self, code, message=""):
        super().__init__(message or code)
        self.code = code


def model_name():
    return os.environ.get("RESUME_MODEL") or "claude-opus-5-5"


def ask_structured(system, prompt, schema, max_tokens=32000):
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        raise ClaudeError("unavailable", "ANTHROPIC_API_KEY is not set.")
    import anthropic

    client = anthropic.Anthropic(max_retries=2, timeout=280)
    params = dict(
        model=model_name(),
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": os.environ.get("RESUME_EFFORT") or "medium",
                       "format": {"type": "json_schema", "schema": schema}},
    )
    try:
        if os.environ.get("RESUME_FALLBACKS", "on") != "off" and not params["model"].startswith("claude-haiku"):
            # Server-side refusal fallback: a declined request is re-run on a fallback model.
            with client.beta.messages.stream(**params, betas=["server-side-fallback-2026-07-01"], fallbacks="default") as s:
                msg = s.get_final_message()
        else:
            with client.messages.stream(**params) as s:
                msg = s.get_final_message()
    except anthropic.RateLimitError as e:
        raise ClaudeError("rate_limited", str(e)) from e
    except anthropic.InternalServerError as e:
        raise ClaudeError("overloaded", str(e)) from e
    except anthropic.APIStatusError as e:
        raise ClaudeError("error", f"{e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise ClaudeError("error", f"connection: {e}") from e

    if msg.stop_reason == "refusal":
        raise ClaudeError("refused", "The model declined this request.")
    if msg.stop_reason == "max_tokens":
        raise ClaudeError("truncated", "The answer was cut off.")
    text = "".join(b.text for b in msg.content if b.type == "text").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ClaudeError("error", "The answer was not valid JSON.") from e
