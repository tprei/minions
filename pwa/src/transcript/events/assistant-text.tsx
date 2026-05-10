import { Markdown } from "../../components/Markdown";

interface Props {
  text: string;
}

export function AssistantText({ text }: Props): JSX.Element {
  return (
    <div className="te te-assistant-text">
      <Markdown source={text} />
    </div>
  );
}
