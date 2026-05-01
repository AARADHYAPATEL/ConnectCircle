function emoji(...codePoints: number[]) {
  return String.fromCodePoint(...codePoints);
}

export const emojiShortcodes = {
  "100": emoji(0x1f4af),
  angry: emoji(0x1f620),
  blush: emoji(0x1f60a),
  broken_heart: emoji(0x1f494),
  check: emoji(0x2705),
  clap: emoji(0x1f44f),
  cloud: emoji(0x2601, 0xfe0f),
  coffee: emoji(0x2615),
  confused: emoji(0x1f615),
  cry: emoji(0x1f622),
  eyes: emoji(0x1f440),
  fire: emoji(0x1f525),
  flower: emoji(0x1f33c),
  grin: emoji(0x1f601),
  heart: emoji(0x2764, 0xfe0f),
  heart_eyes: emoji(0x1f60d),
  hug: emoji(0x1f917),
  joy: emoji(0x1f602),
  laugh: emoji(0x1f606),
  moon: emoji(0x1f319),
  ok_hand: emoji(0x1f44c),
  party: emoji(0x1f389),
  pray: emoji(0x1f64f),
  rainbow: emoji(0x1f308),
  rocket: emoji(0x1f680),
  rofl: emoji(0x1f923),
  sad: emoji(0x1f641),
  skull: emoji(0x1f480),
  smile: emoji(0x1f604),
  sob: emoji(0x1f62d),
  sparkles: emoji(0x2728),
  star: emoji(0x2b50),
  sun: emoji(0x2600, 0xfe0f),
  sunglasses: emoji(0x1f60e),
  thinking: emoji(0x1f914),
  thumbs_down: emoji(0x1f44e),
  thumbs_up: emoji(0x1f44d),
  wave: emoji(0x1f44b),
  wink: emoji(0x1f609),
  x: emoji(0x274c),
} as const;

export type EmojiShortcodeName = keyof typeof emojiShortcodes;

export type EmojiShortcodeOption = {
  emoji: string;
  name: EmojiShortcodeName;
  shortcode: string;
};

const emojiShortcodePattern = /:([a-zA-Z0-9_+-]+):/g;

export function renderEmojiShortcodes(value: string) {
  return value.replace(emojiShortcodePattern, (match, shortcode: string) => {
    const emojiValue =
      emojiShortcodes[shortcode.toLowerCase() as EmojiShortcodeName];

    return emojiValue ?? match;
  });
}

export const emojiShortcodeOptions = Object.entries(emojiShortcodes)
  .map(([name, emojiValue]) => ({
    emoji: emojiValue,
    name: name as EmojiShortcodeName,
    shortcode: `:${name}:`,
  }))
  .sort((first, second) => first.name.localeCompare(second.name));

export const emojiShortcodeExamples = [
  ":smile:",
  ":heart:",
  ":thumbs_up:",
  ":sparkles:",
] as const;
