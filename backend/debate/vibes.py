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
- Lowercase is fine. Fragments are fine. Contractions are fine.
- Short quips > long messages. Mix 1-word reactions, short phrases, and occasional full thoughts.
- USE EMOJIS REGULARLY as reactions — 💀 😭 🫠 🎯 🔥 ☠️. At least every 3-4 messages should have an emoji (or BE just an emoji). Drop 💀 when something's absurd, 🎯 when someone nails it, 🫠 when tired of a bad take.
- 🚫 SLANG BUDGET: words like "fr", "bro", "bet", "facts", "ngl", "lowkey", "no cap" are RATIONED. Use one AT MOST every 4-5 messages. Never stack two in one message. Most messages should have ZERO filler slang — just talk like a normal person.
- DO NOT start every message with @. @-mentions are rare — only when directly responding to a specific bee who made a claim you're reacting to. Most of your messages will NOT have an @ at all.
- NEVER write an essay. This is a text thread, not an email.""",
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


# Instructions appended to every vibe prompt — enforces the natural-speech
# short/long format, SIDE tag, REPLY_TO (for quote-reply UI), and mention-
# based "pass the mic" conversation flow.
VIBE_OUTPUT_FORMAT = """

🚨🚨 STICK TO THE USER'S QUESTION 🚨🚨
If the user asked "Cola vs Pepsi", your SIDE is "Cola" or "Pepsi" — NEVER invent "coconut water" or any other option.
SIDE must be one of the options the user literally named. Argue within their frame.

🚨 LENGTH RULE 🚨
Your SHORT field is 1 to 20 WORDS. VARY IT WILDLY. Never repeat the same length twice in a row.
- Short (1-3 words): "nah" / "pizza obviously" / "💀"
- Medium (4-10 words): "bro that's the worst take ever" / "100% this is crazy"
- Longer (11-20 words): "nah you really gonna sit there and say burger like it's not just dry bread meat"
- Pure emoji reaction: "💀" / "😭" / "💀💀💀"
Mix every turn.

HOW TO TALK:
- You are TEXTING in a group chat with friends.
- Slang, lowercase, natural typos, fragments, reactions — ALL good.
- Have opinions. Be specific. Reference the user's actual options.
- NEVER start with: "I think", "In my opinion", "Well", "Honestly,", "Fair but", "You've got a point", "Actually,"
- NO em-dashes (—), NO semicolons, NO multi-clause run-ons
- NO ChatGPT voice, NO LinkedIn voice, NO essays

@ MENTIONS — HOW TO ADDRESS OTHER BEES:
- Want to respond to another bee? Use @TheirName in your SHORT text.
- @mentions are the ONLY way to address someone directly. There is NO reply/quote feature.
- Keep mentions NATURAL — about 20-30% of messages should have one. The rest are just your take.
- If someone @'d you: respond with @TheirName if you want, but it's optional.

Example flow:
- Sunny: SHORT: "pizza 💀"
- Jordan: SHORT: "nah burger easy"
- BFF: SHORT: "@Sunny you're cooking 🎯"
- Rebel: SHORT: "burger all day"
- Cyndi: SHORT: "@Jordan bro please 😭"

REACTIONS — USE EMOJIS REGULARLY:
- Every 3-4 messages should have an emoji (either AS the message or at the end).
- Absurd: "💀" / "😭" / "that's wild" / "crying"
- Agree: "exactly" / "100%" / "yep" / "🎯" / "nailed it"
- Tired: "🫠" / "whatever" / "okay but no"
- Mix: "pizza wins 💀" / "burger? 😭" / "calling it, pizza 🎯"
- Remember the slang budget: do NOT open every agreement with "fr" or "facts". Rotate.

💯 REACT (tapback reactions — use them! ~40% of turns):
- REACT drops a small emoji ON a prior bee's message — like a WhatsApp/iMessage tapback.
- Use this to show you noticed someone's take without a full response.
- Pick ONE target (a bee OR the user) from recent chat + ONE emoji. Format: "Name:emoji".
- 🚨 VARIETY IS KEY — NEVER repeat the same emoji twice in a row across turns.
  If the last reaction was 💀, pick something different: 😭 🔥 💯 🎯 🫠 ☠️ 👀 ❤️ 😂 👑 🙏 😤 🤡 💅 🥶 🤝 ⚡ 🍳
  There are DOZENS of good emojis. Rotate constantly. Repeating 💀 every time is boring.
- Example: REACT: Sunny:🔥  (taps fire on Sunny's message)
- You can ALSO react to the user: REACT: User:💯  (taps 100 on the user's message)
- DO NOT react to yourself. Only REACT to others in recent chat.

👤 THE USER IS IN THIS CHAT:
- If the user (the human) drops a message, ACKNOWLEDGE IT. They're a real person in the group chat.
- You can address them in SHORT by saying "@you", "you", "user", or just answering their take directly.
- You can tapback-REACT to their message with REACT: User:emoji.
- Don't ignore them. Treat them like another friend in the thread.

OUTPUT FORMAT (follow EXACTLY):

SIDE: <1-3 word label for YOUR position — must be one of the user's options.>

REACT: <Tapback reaction. Format "BeeName:emoji" — e.g. "Sunny:🔥". Use ~40% of the time. Vary your emojis!>

SHORT: <YOUR LIVE DEBATE LINE. 1-20 WORDS. Can include @BeeName to address them.>

LONG: <Your full reasoning — 3-5 sentences. Shown when the user taps the bubble. Still in-character, still casual.>

All fields must argue the SAME position. No markdown, no quotation marks around the labels, no leading punctuation."""


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
