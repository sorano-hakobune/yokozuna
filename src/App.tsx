import React, { useEffect } from "react";
import { Toolbar } from "./components/Toolbar";
import { Timeline } from "./components/Timeline";
import { Stage } from "./components/Stage";
import { Inspector } from "./components/Inspector";
import { PlaybackControls } from "./components/Playback";
import { useProjectStore } from "./stores/projectStore";
import "./components/Timeline/timeline.css";

export const App: React.FC = () => {
  const setSelectedTool = useProjectStore((s) => s.setSelectedTool);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const selectedElementId = useProjectStore((s) => s.selectedElementId);
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const copyElement = useProjectStore((s) => s.copyElement);
  const pasteElement = useProjectStore((s) => s.pasteElement);
  const removeElement = useProjectStore((s) => s.removeElement);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (selectedLayerId && selectedElementId) {
          copyElement(selectedLayerId, currentFrame, selectedElementId);
          e.preventDefault();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (selectedLayerId) {
          pasteElement(selectedLayerId, currentFrame);
          e.preventDefault();
        }
      }

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedElementId &&
        selectedLayerId
      ) {
        removeElement(selectedLayerId, currentFrame, selectedElementId);
        e.preventDefault();
      }

      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === "v") setSelectedTool("select");
        if (e.key === "r") setSelectedTool("rectangle");
        if (e.key === "c") setSelectedTool("circle");
        if (e.key === "l") setSelectedTool("line");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedLayerId,
    selectedElementId,
    currentFrame,
    copyElement,
    pasteElement,
    removeElement,
    setSelectedTool,
  ]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        backgroundColor: "#18181b",
      }}
    >
      <Toolbar />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Stage />
        <Inspector />
      </div>

      <PlaybackControls />
      <Timeline />
    </div>
  );
};

export default App;
