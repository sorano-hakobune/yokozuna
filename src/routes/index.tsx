import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Editor } from "@/components/Editor/Editor";
import { SplashScreen } from "@/components/SplashScreen";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  return (
    <>
      {showSplash && <SplashScreen onDone={handleSplashDone} />}
      <Editor />
    </>
  );
}
