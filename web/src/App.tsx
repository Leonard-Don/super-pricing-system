import { Button } from '@/components/ui/button';

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8 space-y-4">
      <h1 className="text-primary text-2xl font-bold">超级定价系统 v5</h1>
      <p className="text-muted-foreground">暗金台 · bootstrap</p>
      <Button>开始分析</Button>
    </div>
  );
}
