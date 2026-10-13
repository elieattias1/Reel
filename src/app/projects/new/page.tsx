import { createProject } from "@/app/projects/actions";
import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/reel/Button";
import { Input, Label, Textarea } from "@/components/reel/Input";
import { Panel, PanelBody, PanelHeader } from "@/components/reel/Panel";

export default function NewProjectPage() {
  return (
    <div className="flex flex-1 flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
        <Panel>
          <PanelHeader>
            <h1 className="text-sm font-semibold text-zinc-900">New project</h1>
          </PanelHeader>
          <PanelBody>
            <form action={createProject} className="space-y-4">
              <div>
                <Label htmlFor="name">Title</Label>
                <Input id="name" name="name" required autoFocus placeholder="e.g. Low Tide" />
              </div>
              <div>
                <Label htmlFor="logline">Logline (optional)</Label>
                <Textarea id="logline" name="logline" rows={3} placeholder="One or two sentences." />
              </div>
              <Button type="submit" className="w-full">
                Create project
              </Button>
            </form>
          </PanelBody>
        </Panel>
      </main>
    </div>
  );
}
