import type { ActionLogEntry } from "../ActionLog";
import type { RandomEventType } from "../types/canvas";

export function logActionToConsole(
  entry: ActionLogEntry,
  origin: string = "Action Log"
) {
  const name = entry.playerName || entry.playerId || "Player";
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;
  const summary = `${name} (${entry.cardsInHand} in hand): ${entry.action}`;
  const suffix = time ? ` @ ${time}` : "";
  console.info(`[${origin}] ${summary}${suffix}`);
}

export function generatePlayerName() {
  const adjectives = [
    "Swift",
    "Arcane",
    "Silent",
    "Crimson",
    "Verdant",
    "Luminous",
    "Shadow",
    "Iron",
    "Lucky",
    "Misty",
  ];
  const nouns = [
    "Falcon",
    "Mage",
    "Knight",
    "Wisp",
    "Golem",
    "Druid",
    "Rogue",
    "Phoenix",
    "Sphinx",
    "Voyager",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${adj} ${noun} #${suffix}`;
}

export function describeRandomEvent(event: {
  type: RandomEventType;
  result: string;
}) {
  switch (event.type) {
    case "coin":
      return `flipped a coin: ${event.result}`;
    case "d6":
      return `rolled a d6: ${event.result}`;
    case "d20":
      return `rolled a d20: ${event.result}`;
    case "starter":
      return `starting player: ${event.result}`;
    default:
      return `random: ${event.result}`;
  }
}
