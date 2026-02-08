import { Form } from "react-router-dom";
import { Textarea } from "./components/ui/Input";

export default function Home() {
  return (
    <div id="deck">
      <div>
        <Form method="post">
          <Textarea variant="unstyled" name="deck" />
          <button type="submit">Create Deck</button>
        </Form>
      </div>
    </div>
  );
}
