import React from "react";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { useProjectStore } from "@/stores/projectStore";
import type { ToolType } from "@/types/project";

export const Toolbar: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const selectedTool = useProjectStore((s) => s.selectedTool);
  const setSelectedTool = useProjectStore((s) => s.setSelectedTool);
  const addAsset = useProjectStore((s) => s.addAsset);
  const addBitmapElement = useProjectStore((s) => s.addBitmapElement);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const currentFrame = useProjectStore((s) => s.currentFrame);

  const handleSave = async () => {
    try {
      const filePath = await save({
        title: "プロジェクトを保存",
        filters: [{ name: "Project File", extensions: ["json"] }],
      });
      if (filePath) {
        await writeTextFile(filePath, JSON.stringify(project, null, 2));
      }
    } catch (error) {
      console.error("保存エラー:", error);
    }
  };

  const handleOpen = async () => {
    try {
      const filePath = await open({
        title: "プロジェクトを開く",
        filters: [{ name: "Project File", extensions: ["json"] }],
        multiple: false,
        directory: false,
      });
      if (filePath && typeof filePath === "string") {
        const fileContent = await readTextFile(filePath);
        const parsedData = JSON.parse(fileContent);
        setProject(parsedData);
      }
    } catch (error) {
      console.error("読み込みエラー:", error);
    }
  };

  const handleImportImage = async () => {
    try {
      const filePath = await open({
        title: "画像をインポート",
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp"],
          },
        ],
        multiple: false,
        directory: false,
      });

      if (filePath && typeof filePath === "string") {
        const fileName = filePath.split(/[/\\]/).pop() || "image";
        const extension = fileName.split(".").pop() || "png";
        const assetId = addAsset({
          type: "image",
          name: fileName,
          src: `file://${filePath}`,
          mimeType: `image/${extension}`,
        });

        if (selectedLayerId) {
          const cx = project.settings.width / 2;
          const cy = project.settings.height / 2;
          addBitmapElement(selectedLayerId, currentFrame, assetId, cx, cy);
        }
      }
    } catch (error) {
      console.error("画像インポートエラー:", error);
    }
  };

  const tools: { id: ToolType; label: string }[] = [
    { id: "select", label: "↖ 選択" },
    { id: "rectangle", label: "▢ 矩形" },
    { id: "circle", label: "○ 円" },
    { id: "line", label: "/ 線" },
  ];

  return (
    <header style={headerStyle}>
      <div style={logoStyle}>Yokozuna</div>
      <div style={menuStyle}>
        {tools.map((t) => (
          <button
            key={t.id}
            style={
              selectedTool === t.id ? activeButtonStyle : buttonStyle
            }
            onClick={() => setSelectedTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div style={dividerStyle} />
        <button style={buttonStyle} onClick={handleOpen}>
          📁 開く
        </button>
        <button style={buttonStyle} onClick={handleSave}>
          💾 保存
        </button>
        <div style={dividerStyle} />
        <button style={buttonStyle} onClick={handleImportImage}>
          🖼️ 画像
        </button>
      </div>
    </header>
  );
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  backgroundColor: "#18181b",
  borderBottom: "1px solid #27272a",
  color: "#f4f4f5",
  userSelect: "none",
};

const logoStyle: React.CSSProperties = {
  fontWeight: "bold",
  fontSize: "14px",
  letterSpacing: "1px",
};

const menuStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#27272a",
  border: "1px solid #3f3f46",
  color: "#ffffff",
  borderRadius: "4px",
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: "12px",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const activeButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: "#3b82f6",
  borderColor: "#2563eb",
};

const dividerStyle: React.CSSProperties = {
  width: "1px",
  height: "24px",
  backgroundColor: "#3f3f46",
  margin: "0 4px",
};
