/**
 * Narrow, explicitly curated Qur'an-only seed sets for common thematic listing
 * requests. These are NOT a general-purpose semantic concordance and do not
 * promise conceptual exhaustiveness. Every verse is subsequently checked
 * against the canonical Arabic corpus before being shown.
 */
import type { ClassifiedVerse } from "./ccc-thematic-list";

const earthlyTesting: ClassifiedVerse[] = [
  { reference: "11:7", category: "general", explanation: "The creation of heavens and earth is associated with testing which people act best." },
  { reference: "18:7", category: "general", explanation: "What is on the earth is made an adornment to test who is best in deeds." },
  { reference: "21:35", category: "general", explanation: "People are tested through evil and good and will return to God." },
  { reference: "67:2", category: "general", explanation: "Death and life are created to test which people are best in deeds." },
  { reference: "76:2", category: "general", explanation: "Human beings are created and tested, with hearing and sight granted." },
  { reference: "2:155", category: "situational", explanation: "Testing through fear, hunger, and losses of wealth, lives, and fruits." },
  { reference: "3:142", category: "situational", explanation: "The passage tests who strives and perseveres." },
  { reference: "3:186", category: "situational", explanation: "Believers are to be tested in their wealth and themselves." },
  { reference: "6:165", category: "situational", explanation: "Different degrees of provision and rank are a test in what people receive." },
  { reference: "7:168", category: "situational", explanation: "People are tested with good circumstances and bad ones." },
  { reference: "8:28", category: "situational", explanation: "Wealth and children are described as a trial." },
  { reference: "29:2", category: "situational", explanation: "People are not left untested simply because they say they believe." },
  { reference: "29:3", category: "situational", explanation: "Earlier people were tested to distinguish truthful claims from false ones." },
  { reference: "47:31", category: "situational", explanation: "Testing identifies those who strive and are patient." },
  { reference: "64:15", category: "situational", explanation: "Wealth and children are described as a trial." },
  { reference: "89:15", category: "situational", explanation: "A person's prosperity is explicitly framed as a divine test." },
  { reference: "89:16", category: "situational", explanation: "A person's restricted provision is explicitly framed as a divine test." },
  { reference: "27:40", category: "historical", explanation: "Sulaymān describes a favour as a test of gratitude." },
];

/** Only activate this pack when the user actually asks about human earthly life/testing. */
export function curatedThemeForQuestion(question: string): { title: string; verses: ClassifiedVerse[] } | null {
  const q = question.toLowerCase();
  const earthly = /\b(world|worldly|earth|earthly|life|living|human(?:ity|s)?|people|mankind|existence|creation)\b/.test(q);
  const trial = /\b(test(?:s|ed|ing)?|trial(?:s)?|tried|prove|proving|exam(?:ination)?|ابتلا|فتن[هة]?|بل[ويا])\b/.test(q);
  return earthly && trial ? { title: "Life and worldly circumstances as a test", verses: earthlyTesting } : null;
}
