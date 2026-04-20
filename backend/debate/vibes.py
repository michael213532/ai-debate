"""Debate vibes - format presets that shape how bees interact in a debate.

Each vibe is a "setting" (like a courtroom or group chat). Bees stay in their
personality — the vibe is the stage, the personality is how they behave on it.
"""
from dataclasses import dataclass


@dataclass
class Vibe:
    id: str
    name: str
    emoji: str
    description: str
    # System prompt fragment that flavors the bee's language and format
    prompt_rules: str


VIBES: dict[str, Vibe] = {
    "group-chat": Vibe(
        id="group-chat",
        name="Group Chat",
        emoji="💬",
        description="Casual iMessage-style banter. Short quips, reactions, interruptions.",
        prompt_rules="""VIBE: Group Chat.
You are all in a casual group chat (iMessage / WhatsApp vibe).
- Talk like a real person texting friends: casual, loose, natural English.
- But still informed. Your takes draw on real knowledge, not slang.
- Lowercase fine. Fragments fine. Contractions fine.
- Short quips for SHORT, real reasoning for LONG. SHORT can be punchy but should say something specific.
- Emojis in moderation (every 3-4 messages, not every one). Drop 💀 when something's absurd, 🎯 when someone nails it, 🫠 when tired of a bad take.
- Slang is rationed. Words like "fr"/"bro"/"bet"/"facts"/"ngl"/"lowkey" at most once every 4-5 messages. Most messages have zero filler slang. Just talk.
- @-mentions rare. Only when you want a specific bee to respond next. Most messages have no @.
- Never write an essay for SHORT. That's a text thread. But LONG is where you actually explain.""",
    ),
    "brawl": Vibe(
        id="brawl",
        name="Brawl",
        emoji="🥊",
        description="Chaos. Bees interrupt, tackle, pile on. Loudest voice wins.",
        prompt_rules="""VIBE: Brawl.
You are in a full-on shouting match. Verbal brawl. No rules.
- BE LOUD. BE AGGRESSIVE. Interrupt. Cut people off mid-thought.
- Use short, punchy, fighting words. "NO." "WRONG." "SHUT UP."
- Attack other bees' positions directly and without mercy.
- Never concede. Never hedge. You're in a verbal fistfight.""",
    ),
    "courtroom": Vibe(
        id="courtroom",
        name="Courtroom",
        emoji="⚖️",
        description="Formal legal proceedings. Prosecution vs defense. Objections.",
        prompt_rules="""VIBE: Courtroom.
You are in a courtroom. This is a formal legal proceeding.
- Use legal/courtroom language where it fits: "Your Honor", "the evidence shows", "I object", "ladies and gentlemen of the jury".
- Frame your argument like a lawyer: claim + evidence + conclusion.
- You can directly object to other bees' "testimony".
- Stay formal in structure, but let your personality bleed through the formality.""",
    ),
    "boardroom": Vibe(
        id="boardroom",
        name="Boardroom",
        emoji="💼",
        description="High-stakes executive meeting. Strategic. Table-slamming.",
        prompt_rules="""VIBE: Boardroom.
You are in a high-stakes executive boardroom meeting. Billions on the line.
- Talk like an executive: strategic, confident, results-oriented.
- Use business language: "ROI", "strategic play", "bottom line", "let's be clear".
- Reference "the data", "the numbers", "the market" even when absurd.
- Occasionally interrupt with "Point of order" or "Let me stop you right there".""",
    ),
    "panel-show": Vibe(
        id="panel-show",
        name="Panel Show",
        emoji="🎤",
        description="Game-show style. Rapid-fire takes. Host energy.",
        prompt_rules="""VIBE: Panel Show.
You are a guest on a live panel show (think Hot Ones / QI / late-night panel).
- Be performative — you're on camera. Play to the audience.
- Quick, punchy takes. Land a joke if you can.
- You can directly call out other panelists: "come on, that's a hot take".
- Slightly more theatrical than normal conversation. The camera is on you.""",
    ),
}


DEFAULT_VIBE = "group-chat"


def get_vibe(vibe_id: str) -> Vibe | None:
    return VIBES.get(vibe_id)


def list_vibes() -> list[dict]:
    return [
        {
            "id": v.id,
            "name": v.name,
            "emoji": v.emoji,
            "description": v.description,
        }
        for v in VIBES.values()
    ]


# Instructions appended to every vibe prompt — enforces the format spec.
# Two-field design: SHORT is the casual-but-informed live bubble; LONG is where
# the real reasoning/substance lives (shown on tap).
VIBE_OUTPUT_FORMAT = """

OUTPUT FORMAT (follow EXACTLY):

SIDE: <1-3 word label for your position. Must be one of the user's exact options.>

REACT: <Optional tapback. "BeeName:emoji" (e.g. "Sunny:🔥"). Use ~30% of turns. Pick a different emoji each time (rotate: 💀 😭 🔥 💯 🎯 🫠 👀 ❤️ 😂 👑 🙏 😤 🤝 ⚡). You can REACT to the user too: "User:💯". Don't REACT to yourself. Leave blank if nothing fits.>

SHORT: <Your live line. 1-25 words, casual voice, but says something SPECIFIC. Reference real details of the topic. Not vapid slang. Can include @BeeName to address them. If you have nothing specific, keep it minimal.>

LONG: <3-6 sentences. The REAL answer. Actual reasoning, facts you know, concrete specifics. Shown when the user taps the bubble. Still in-character, still casual prose, but with genuine substance. DO NOT just pad the SHORT. Use LONG to actually think. This is where you earn the listener's time.>

All fields argue the SAME position. No markdown, no quotation marks around the labels.

SHORT vs LONG:
- SHORT = what you'd text. Punchy, casual, INFORMED (not vapid).
- LONG = what you'd say out loud if asked "wait, why?" Real reasons, actual facts, specifics.
- Think ChatGPT-quality substance, flavored in YOUR character's voice.

@ MENTIONS: rare. Use @BeeName in SHORT only when inviting that bee to respond next. Default: no @.

THE USER IS IN THIS CHAT: if the user jumps in, acknowledge them. You can address them with "@you"/"you"/"user" in SHORT, or REACT: User:emoji."""


def parse_bee_response(text: str) -> tuple[str, str, str, str, list[dict]]:
    """Parse a raw AI response into (side, short, long, reply_to, reactions) using labels.

    Falls back gracefully if fields are missing. reply_to is optional (may be '').
    reactions is a list of {"target": name, "emoji": emoji} dicts (may be empty).
    """
    if not text:
        return "", "", "", "", []
    # Normalize: strip stars/backticks that some models wrap labels in
    cleaned = text
    for label in ("SIDE", "REPLY_TO", "REACT", "SHORT", "LONG"):
        cleaned = cleaned.replace(f"**{label}:**", f"{label}:").replace(f"**{label}**:", f"{label}:")

    def _strip(s: str) -> str:
        s = s.strip().strip('"').strip()
        for ch in ("[", "]", "<", ">"):
            if s.startswith(ch):
                s = s[1:].strip()
            if s.endswith(ch):
                s = s[:-1].strip()
        if s.lower() in ("none", "null", "n/a", "na", "blank", ""):
            return ""
        return s

    def _extract_field(haystack: str, label: str, next_labels: list[str]) -> str:
        if f"{label}:" not in haystack:
            return ""
        after = haystack.split(f"{label}:", 1)[1]
        # Find the earliest occurrence of any next label
        end = len(after)
        for nxt in next_labels:
            idx = after.find(f"{nxt}:")
            if idx != -1 and idx < end:
                end = idx
        return _strip(after[:end])

    side = _extract_field(cleaned, "SIDE", ["REPLY_TO", "REACT", "SHORT", "LONG"])
    reply_to = ""
    react_raw = _extract_field(cleaned, "REACT", ["SHORT", "LONG"])
    short = _extract_field(cleaned, "SHORT", ["LONG"])
    long = _extract_field(cleaned, "LONG", [])

    reactions = _parse_react_field(react_raw)

    # If nothing parsed, fall back to whole text as short
    if not short and not side and not reply_to and not reactions:
        return "", text.strip(), "", "", []

    return side, short, long, reply_to, reactions


def _parse_react_field(raw: str) -> list[dict]:
    """Parse 'Name:emoji, Name2:emoji2' into a list of {target, emoji} dicts.

    Tolerates slight format variance ('Name - emoji', extra whitespace, etc).
    """
    if not raw:
        return []
    out: list[dict] = []
    # Split on comma, semicolon, or pipe — any reasonable separator the model might use
    import re as _re
    parts = _re.split(r"[,;|]", raw)
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Split on first colon or dash
        sep_match = _re.search(r"[:\-–]", part)
        if not sep_match:
            continue
        target = part[: sep_match.start()].strip().strip('"').strip("'")
        emoji = part[sep_match.end() :].strip().strip('"').strip("'")
        if target and emoji and len(emoji) <= 12:  # guard against the model writing a sentence
            out.append({"target": target, "emoji": emoji})
    return out


def extract_short(content: str) -> str:
    """Extract the short version from a stored message content field.

    Handles both new JSON format ({"side", "short", "long"}) and legacy plain text.
    """
    if not content:
        return ""
    stripped = content.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            import json
            data = json.loads(stripped)
            if isinstance(data, dict) and "short" in data:
                return data["short"] or ""
        except (ValueError, TypeError):
            pass
    return content


def extract_short_and_long(content: str) -> tuple[str, str]:
    """Extract (short, long) from stored message content."""
    if not content:
        return "", ""
    stripped = content.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            import json
            data = json.loads(stripped)
            if isinstance(data, dict):
                return data.get("short", "") or "", data.get("long", "") or ""
        except (ValueError, TypeError):
            pass
    return content, ""


def extract_reply_to(content: str) -> str:
    """Extract the reply_to field from stored message content."""
    if not content:
        return ""
    stripped = content.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            import json
            data = json.loads(stripped)
            if isinstance(data, dict):
                return data.get("reply_to", "") or ""
        except (ValueError, TypeError):
            pass
    return ""


def extract_reactions(content: str) -> list[dict]:
    """Extract the reactions list from stored message content."""
    if not content:
        return []
    stripped = content.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            import json
            data = json.loads(stripped)
            if isinstance(data, dict):
                r = data.get("reactions") or []
                if isinstance(r, list):
                    return [x for x in r if isinstance(x, dict) and x.get("target") and x.get("emoji")]
        except (ValueError, TypeError):
            pass
    return []
