export type StoryStep = {
  id: string;
  number: string;
  title: string;
  headline: string;
  body: string;
};

export const storySteps: readonly StoryStep[] = [
  {
    id: "portfolio",
    number: "01",
    title: "Portfolio",
    headline: "We read what you've built.",
    body: "Upload your portfolio. Vetted maps your projects, stack and skills.",
  },
  {
    id: "assessment",
    number: "02",
    title: "Assessment",
    headline: "Then write a test for it.",
    body: "A 60-minute challenge in your own stack, pitched at your level.",
  },
  {
    id: "evaluation",
    number: "03",
    title: "Evaluation",
    headline: "Your code faces real tests.",
    body: "It runs in an isolated sandbox. Tests decide the result, not opinions.",
  },
  {
    id: "report",
    number: "04",
    title: "Report",
    headline: "Proof you can show.",
    body: "One score, backed by every test you passed.",
  },
];
