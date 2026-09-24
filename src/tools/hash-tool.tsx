import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PersistentPanel } from '@/components/persistent-panel'
import { HashSinglePanel } from '@/tools/hash-single-panel'
import { HashBatchPanel } from '@/tools/hash-batch'
import { HashManifestPanel } from '@/tools/hash-manifest'

export function HashTool() {
  return (
    <Tabs defaultValue="single" className="gap-4">
      <TabsList className="w-full max-w-lg">
        <TabsTrigger value="single">文本与文件</TabsTrigger>
        <TabsTrigger value="batch">批量计算</TabsTrigger>
        <TabsTrigger value="compare">清单比对</TabsTrigger>
      </TabsList>

      <PersistentPanel value="single">
        <HashSinglePanel />
      </PersistentPanel>
      <PersistentPanel value="batch">
        <HashBatchPanel />
      </PersistentPanel>
      <PersistentPanel value="compare">
        <HashManifestPanel />
      </PersistentPanel>
    </Tabs>
  )
}
