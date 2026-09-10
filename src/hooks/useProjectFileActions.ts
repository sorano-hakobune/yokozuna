import { useProjectStore } from "@/stores/projectStore";
import {
  downloadProjectJson,
  openProjectFile,
  pickFiles,
  PROJECT_FILE_ACCEPT,
} from "@/lib/project";

export function useProjectFileActions() {
  const project = useProjectStore((state) => state.project);
  const setProject = useProjectStore((state) => state.setProject);
  const markProjectSaved = useProjectStore((state) => state.markProjectSaved);
  const isDocumentDirty = useProjectStore((state) => state.isDocumentDirty);

  const saveProject = () => {
    void downloadProjectJson(project).then((result) => {
      if (result.status === "cancelled") return;
      const chosen = result.fileName.replace(/\.[^.]+$/, "");
      if (chosen && chosen !== project.meta.name) {
        useProjectStore.getState().updateMeta({ name: chosen });
      }
      markProjectSaved();
    });
  };

  const openProject = async () => {
    if (
      isDocumentDirty() &&
      !window.confirm("未保存の変更があります。プロジェクトを開きますか？")
    ) {
      return;
    }
    const file = await pickFiles({ accept: PROJECT_FILE_ACCEPT }).then(
      ([selected]) => selected,
    );
    if (file) await openProjectFile(file, setProject);
  };

  return { saveProject, openProject };
}
