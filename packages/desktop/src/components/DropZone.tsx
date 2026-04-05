import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FolderOpen } from 'lucide-react';
import { useDocumentStore } from '../store/documentStore';

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/tiff': ['.tiff', '.tif'],
};

export function DropZone() {
  const { importFiles } = useDocumentStore();

  const onDrop = useCallback(
    (accepted: File[]) => {
      importFiles(accepted);
    },
    [importFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    multiple: true,
  });

  const handlePickFiles = async () => {
    const paths = await window.electron?.openFiles();
    if (paths?.length) {
      useDocumentStore.getState().importFilePaths(paths);
    }
  };

  return (
    <div
      {...getRootProps()}
      className={`
        relative border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
        ${isDragActive
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
        }
      `}
    >
      <input {...getInputProps()} />

      <Upload
        className={`mx-auto mb-3 w-10 h-10 ${isDragActive ? 'text-blue-400' : 'text-slate-500'}`}
      />

      {isDragActive ? (
        <p className="text-blue-400 font-medium">Dateien hier ablegen…</p>
      ) : (
        <>
          <p className="text-slate-300 font-medium">PDF oder Bild hierher ziehen</p>
          <p className="text-slate-500 text-sm mt-1">oder</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePickFiles();
            }}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Datei auswählen
          </button>
          <p className="text-slate-600 text-xs mt-3">PDF, PNG, JPG, TIFF</p>
        </>
      )}
    </div>
  );
}
