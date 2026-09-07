import { useProjectStore } from "@/stores/projectStore";
import { downloadProjectJson, openProjectFile, pickFiles } from "@/lib/project";

export function useProjectFileActions() {
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  const markProjectSaved = useProjectStore((state) => state.markProjectSaved);
  const isDocumentDirty = useProjectStore((state) => state.isDocumentDirty);

  const saveProject = () => {
    downloadProjectJson(project);
    markProjectSaved();
  };

  const openProject = async () => {
    if (
      isDocumentDirty() &&
      !window.confirm("未保存の変更があります。プロジェクトを開きますか？")
    ) {
      return;
    }
    const file = await pickFiles({ accept: "application/json,.json" }).then(
      ([selected]) => selected,
    );
    if (file) await openProjectFile(file, setProject);
  };

  return { saveProject, openProject };
}
