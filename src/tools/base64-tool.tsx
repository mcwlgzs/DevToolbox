import { BinaryIcon, FileLock2Icon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileWorkbench } from '@/components/file-workbench'
import { PersistentPanel } from '@/components/persistent-panel'
import { TextWorkbench } from '@/components/text-workbench'

export function Base64Tool() {
  return (
    <Tabs defaultValue="text" className="gap-4">
      <TabsList className="w-full max-w-xs">
        <TabsTrigger value="text" className="gap-1.5">
          <BinaryIcon />
          文本编解码
        </TabsTrigger>
        <TabsTrigger value="file" className="gap-1.5">
          <FileLock2Icon />
          文件编解码
        </TabsTrigger>
      </TabsList>

      {/* 两个工作区常驻挂载：在文本页粘贴过的内容，切到文件页再切回来不该消失 */}
      <PersistentPanel value="text">
        <TextWorkbench />
      </PersistentPanel>
      <PersistentPanel value="file">
        <FileWorkbench />
      </PersistentPanel>
    </Tabs>
  )
}
