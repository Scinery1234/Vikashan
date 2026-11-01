"""Spec sections 5, 7, 9 and 14: one workflow state, and how replies move it.

Change from the original spec: there is no "Reply Y" gate. Approving the
content produces the Phase 2 JSON and then generates, runs and checks the
Word file in the same turn. AWAITING_EXECUTION_APPROVAL stays only so that
sessions saved at the old gate still work.

The gates are decided here in code, not by the model, so the agent can never
skip content approval or run the script without a Y. The same word lists are
mirrored in Vikashan lib/newpage-resume-flow.js; keep them in step.
"""
import re
from enum import Enum


class State(str, Enum):
    DRAFTING = "DRAFTING"
    AWAITING_CONTENT_APPROVAL = "AWAITING_CONTENT_APPROVAL"
    PREPARING_JSON = "PREPARING_JSON"
    AWAITING_EXECUTION_APPROVAL = "AWAITING_EXECUTION_APPROVAL"
    GENERATING_SCRIPT = "GENERATING_SCRIPT"
    EXECUTING_SCRIPT = "EXECUTING_SCRIPT"
    COMPLETED = "COMPLETED"
    EXECUTION_FAILED = "EXECUTION_FAILED"


# Exact wording required by the spec.
APPROVE_PROMPT = "Approve content? Please reply “Yes” or provide the amendments required."
PHASE2_HEADING = "Phase 2, Prepare"
NO_EXECUTION_MESSAGE = (
    "I created the complete Python script, but this Claude environment does not provide code execution or "
    "file-generation tools. I cannot truthfully confirm that the Word document was generated. Run the script "
    "in a Python environment with `python-docx` installed, or connect this agent to a sandboxed Python execution tool."
)

CONTENT_APPROVALS = {
    "yes", "y", "yep", "yeah", "yes please", "approved", "approve", "i approve", "looks good", "look good",
    "looks great", "all good", "proceed", "go ahead", "content approved", "approved thanks", "perfect",
    "that is great", "thats great", "happy with it", "im happy with it", "lgtm", "yes approved",
    "yes looks good", "yes proceed", "yes go ahead", "good to go", "sounds good",
}
EXECUTION_APPROVALS = {
    "y", "yes", "yep", "yeah", "yes please", "go", "go ahead", "proceed", "do it", "generate", "generate it",
    "create it", "run it", "approved", "ok go", "okay go", "yes generate", "yes go ahead", "please do",
    "make it", "build it", "create the word resume", "generate the word resume", "try again", "retry",
}
# Words that mean the person wants something changed, even after "yes".
CHANGE_WORDS = re.compile(
    r"\b(but|however|except|change|changes|amend|add|remove|delete|drop|replace|rewrite|reword|shorten|lengthen|"
    r"fix|update|edit|instead|include|mention|move|swap|correct|wrong|should|could you|can you|please make|make the|"
    r"missing|less|more)\b")
_EXTRA = re.compile(r"\b(please|thanks|thank you|thankyou|cheers|mate|again|all)\b")


def _norm(text):
    t = (text or "").lower().replace("’", "'")
    t = re.sub(r"[^\w\s']", " ", t)
    t = t.replace("'", "")
    return re.sub(r"\s+", " ", t).strip()


def _is_approval(text, phrases):
    t = _norm(text)
    if not t or CHANGE_WORDS.search(t):
        return False
    if t in phrases:
        return True
    bare = re.sub(r"\s+", " ", _EXTRA.sub(" ", t)).strip()
    return bare in phrases


def classify_content_reply(text):
    """After the draft: 'approve', 'amend' (text holds the changes) or 'unclear' (ask again)."""
    if _is_approval(text, CONTENT_APPROVALS):
        return "approve"
    t = _norm(text)
    # "okay", "no", "hmm": not approval and nothing to change.
    if len(t.split()) <= 2 and not CHANGE_WORDS.search(t):
        return "unclear"
    return "amend"


def classify_execution_reply(text):
    """After a failed build: 'execute' (try again), 'amend' (back to the draft) or 'unclear'."""
    if _is_approval(text, EXECUTION_APPROVALS):
        return "execute"
    t = _norm(text)
    if len(t.split()) <= 3 and not CHANGE_WORDS.search(t):
        return "unclear"
    return "amend"


TRANSITIONS = {
    (State.DRAFTING, "drafted"): State.AWAITING_CONTENT_APPROVAL,
    (State.AWAITING_CONTENT_APPROVAL, "approve"): State.PREPARING_JSON,
    (State.AWAITING_CONTENT_APPROVAL, "amend"): State.DRAFTING,
    # Content approval is the only gate: the JSON goes straight on to the script.
    (State.PREPARING_JSON, "json_ready"): State.GENERATING_SCRIPT,
    (State.AWAITING_EXECUTION_APPROVAL, "execute"): State.GENERATING_SCRIPT,
    (State.AWAITING_EXECUTION_APPROVAL, "amend"): State.DRAFTING,
    (State.GENERATING_SCRIPT, "script_ready"): State.EXECUTING_SCRIPT,
    (State.EXECUTING_SCRIPT, "validated"): State.COMPLETED,
    (State.EXECUTING_SCRIPT, "failed"): State.EXECUTION_FAILED,
    (State.EXECUTION_FAILED, "retry"): State.GENERATING_SCRIPT,
    (State.COMPLETED, "amend"): State.DRAFTING,
    (State.COMPLETED, "retry"): State.GENERATING_SCRIPT,
    (State.EXECUTION_FAILED, "amend"): State.DRAFTING,
}


def advance(state, event):
    """Next state, or ValueError for a move the spec does not allow."""
    key = (State(state), event)
    if key not in TRANSITIONS:
        raise ValueError(f"{event!r} is not allowed from {State(state).value}.")
    return TRANSITIONS[key]
