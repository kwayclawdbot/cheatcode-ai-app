import type { PathId } from "./personas";
export type Feature =
  | "lesson"
  | "alert"
  | "chart"
  | "company"
  | "path"
  | "kai"
  | "community"
  | "track"
  | "plan"
  | "grade"
  | "belt";
export type Choice = { id: Feature; label: string; benefit: string };
export const FIRST: Record<PathId, Feature> = {
  learn: "lesson",
  swing: "alert",
  pro: "chart",
};
export const INTERESTS: Record<PathId, Choice[]> = {
  learn: [
    {
      id: "company",
      label: "Finding good companies",
      benefit: "Find companies to understand and own",
    },
    {
      id: "chart",
      label: "Understanding charts",
      benefit: "Understand charts with Kai",
    },
    {
      id: "path",
      label: "Learning trading",
      benefit: "A guided path into trading",
    },
  ],
  swing: [
    {
      id: "kai",
      label: "Why Kai likes it",
      benefit: "Kai explanations for each setup",
    },
    {
      id: "community",
      label: "What traders are saying",
      benefit: "An active trading room",
    },
    {
      id: "track",
      label: "What happens after I track it",
      benefit: "Follow setups as they develop",
    },
  ],
  pro: [
    {
      id: "plan",
      label: "Build the trade plan",
      benefit: "Build a plan before entering",
    },
    {
      id: "grade",
      label: "See how Kai grades execution",
      benefit: "Feedback on execution",
    },
    {
      id: "belt",
      label: "See Black Belt progression",
      benefit: "Progress toward Black Belt",
    },
  ],
};
export const PRIORITIES: Record<PathId, Choice[]> = {
  learn: [
    {
      id: "belt",
      label: "Building confidence",
      benefit: "Build confidence through practice",
    },
    {
      id: "community",
      label: "Learning with other people",
      benefit: "A community to learn with",
    },
    {
      id: "plan",
      label: "Knowing my risk",
      benefit: "Understand risk before a trade",
    },
  ],
  swing: [
    {
      id: "chart",
      label: "Better entries",
      benefit: "See the levels behind an entry",
    },
    {
      id: "plan",
      label: "Risk management",
      benefit: "Define risk before entering",
    },
    {
      id: "grade",
      label: "Discipline",
      benefit: "Review how well you followed the plan",
    },
  ],
  pro: [
    {
      id: "chart",
      label: "Better entries",
      benefit: "Read structure with Kai",
    },
    {
      id: "plan",
      label: "Risk management",
      benefit: "Size a trade around its risk",
    },
    {
      id: "grade",
      label: "Discipline",
      benefit: "Develop consistent execution",
    },
  ],
};
export function priorityChoices(path: PathId, interest?: Feature) {
  const choices = PRIORITIES[path].filter((c) => c.id !== interest);
  return choices.length === 3
    ? choices
    : [
        ...choices,
        {
          id: "community" as Feature,
          label: "Community reputation",
          benefit: "Build a reputation in the room",
        },
      ];
}
export const CHAPTER: Record<Feature, string> = {
  lesson: "LEARN",
  alert: "DISCOVER",
  chart: "ANALYZE",
  company: "INVEST",
  path: "LEARN",
  kai: "ANALYZE",
  community: "DISCUSS",
  track: "TRACK",
  plan: "PLAN",
  grade: "IMPROVE",
  belt: "GROW",
};
export function validChoice(
  path: PathId,
  value: string | undefined,
  kind: "interest" | "priority",
  interest?: Feature,
) {
  return (
    kind === "interest" ? INTERESTS[path] : priorityChoices(path, interest)
  ).find((c) => c.id === value);
}
