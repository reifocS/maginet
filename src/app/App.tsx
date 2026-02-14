import { Toaster } from "react-hot-toast";
import Canvas from "../board/Canvas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Canvas />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
