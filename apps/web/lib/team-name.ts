const TEAM_NAMES = [
  "Shadow Company",
  "Phantom Force",
  "Ring Walkers",
  "Drop Shock",
  "Storm Chasers",
  "Apex Hunters",
  "Death Box Co.",
  "Hot Zone",
  "Skull Town Vets",
  "Fragment Kings",
  "Third Party Inc.",
  "Kraber Crew",
  "Mastiff Squad",
  "Wingman Mafia",
  "Gold Shields",
  "Purple Armor",
  "Loot Goblins",
  "Zip Line Gang",
  "Last Ring",
  "Zone Keepers",
  "Neon Ghosts",
  "Iron Wolves",
  "Dark Matter",
  "Void Runners",
  "Static Squad",
  "Warp Drive",
  "Holo Spray Co.",
  "Thermite Rain",
  "Arc Star Toss",
  "Recon Sweep",
  "Night Prowlers",
  "Care Package",
  "Phase Shift",
  "Gravity Lift",
  "Jump Pad Inc.",
  "Black Market",
  "Drone Swarm",
  "Portal Hoppers",
  "Dome Shield",
  "Smoke Screen",
];

const TEAM_COLORS = [
  { bg: "bg-violet-500/15", border: "border-violet-500/30", text: "text-violet-300", dot: "bg-violet-400" },
  { bg: "bg-cyan-500/15", border: "border-cyan-500/30", text: "text-cyan-300", dot: "bg-cyan-400" },
  { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-300", dot: "bg-amber-400" },
  { bg: "bg-rose-500/15", border: "border-rose-500/30", text: "text-rose-300", dot: "bg-rose-400" },
  { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-300", dot: "bg-emerald-400" },
  { bg: "bg-fuchsia-500/15", border: "border-fuchsia-500/30", text: "text-fuchsia-300", dot: "bg-fuchsia-400" },
  { bg: "bg-sky-500/15", border: "border-sky-500/30", text: "text-sky-300", dot: "bg-sky-400" },
  { bg: "bg-orange-500/15", border: "border-orange-500/30", text: "text-orange-300", dot: "bg-orange-400" },
  { bg: "bg-teal-500/15", border: "border-teal-500/30", text: "text-teal-300", dot: "bg-teal-400" },
  { bg: "bg-indigo-500/15", border: "border-indigo-500/30", text: "text-indigo-300", dot: "bg-indigo-400" },
];

function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Given a set of player account IDs, returns a deterministic team name and color.
 * The same set of players always produces the same result regardless of order.
 */
export function getTeamIdentity(memberIds: string[]) {
  const key = [...memberIds].sort().join("|");
  const hash = stableHash(key);
  const name = TEAM_NAMES[hash % TEAM_NAMES.length];
  const color = TEAM_COLORS[hash % TEAM_COLORS.length];
  return { name, color };
}
