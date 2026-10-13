"use client";

import { Camera, Play } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/reel/Button";
import { EmptyState } from "@/components/reel/EmptyState";
import { rowToSet, rowToShot } from "@/lib/overheads/db";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { OverheadSceneData, OverheadSceneSummary } from "@/lib/overheads/load-scene";
import type { SetRow, ShotRow } from "@/lib/supabase/types";
import { BlockingAgentPanel } from "./BlockingAgentPanel";
import { OverheadCanvas } from "./OverheadCanvas";
import { usePlayMovement } from "./usePlayMovement";
import { useShotTransition } from "./useShotTransition";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  pendingChanges?: { id: string; title: string; description: string; status: "pending" | "approved" | "rejected" }[];
}

export interface OverheadWorkspaceProps {
  projectId: string;
  scenes: OverheadSceneSummary[];
  initialSceneData: OverheadSceneData | null;
  initialChatHistory: ChatTurn[];
}

export function OverheadWorkspace({ projectId, scenes, initialSceneData, initialChatHistory }: OverheadWorkspaceProps) {
  const [currentSceneId, setCurrentSceneId] = React.useState(initialSceneData?.scene.id ?? scenes[0]?.id);
  const cacheRef = React.useRef<Map<string, OverheadSceneData>>(
    new Map(initialSceneData ? [[initialSceneData.scene.id, initialSceneData] as const] : [])
  );

  const [sceneData, setSceneData] = React.useState<OverheadSceneData | null>(initialSceneData);
  const [loading, setLoading] = React.useState(false);
  const [activeShotIndex, setActiveShotIndex] = React.useState(0);
  const [allSetupsMode, setAllSetupsMode] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);

  // Streams each new shot in as the blocking agent's add_shot tool inserts
  // it (brief: "Shots stream to the UI one at a time as the agent creates
  // them"), via Supabase Realtime rather than polling.
  React.useEffect(() => {
    if (!currentSceneId) return;
    const supabase = createClient();
    const sceneNumber = scenes.find((s) => s.id === currentSceneId)?.number;

    const channel = supabase
      .channel(`shots:${currentSceneId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shots", filter: `scene_id=eq.${currentSceneId}` },
        (payload) => {
          const newShot = rowToShot(payload.new as ShotRow, String(sceneNumber ?? ""));
          setSceneData((prev) => {
            if (!prev || prev.scene.id !== currentSceneId) return prev;
            if (prev.shots.some((s) => s.id === newShot.id)) return prev;
            const updated = { ...prev, shots: [...prev.shots, newShot], scene: { ...prev.scene, shotCount: prev.shots.length + 1 } };
            cacheRef.current.set(currentSceneId, updated);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSceneId, scenes]);

  // The agent's create_set (then any update_set) also needs to reach a
  // scene that was loaded before a set existed for its location — the
  // shots subscription above doesn't cover this, since sets aren't keyed
  // by scene_id.
  React.useEffect(() => {
    const locationId = scenes.find((s) => s.id === currentSceneId)?.locationId;
    if (!locationId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`sets:${locationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sets", filter: `location_id=eq.${locationId}` },
        (payload) => {
          const row = payload.new as SetRow | undefined;
          if (!row) return;
          const newSet = rowToSet(row);
          setSceneData((prev) => {
            if (!prev || prev.scene.id !== currentSceneId) return prev;
            const updated = { ...prev, set: newSet };
            cacheRef.current.set(currentSceneId, updated);
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSceneId, scenes]);

  const loadScene = React.useCallback(
    async (sceneId: string) => {
      const cached = cacheRef.current.get(sceneId);
      if (cached) {
        setSceneData(cached);
        setCurrentSceneId(sceneId);
        setActiveShotIndex(0);
        setPlaying(false);
        return;
      }
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/overheads/scenes/${sceneId}`);
      if (res.ok) {
        const data: OverheadSceneData = await res.json();
        cacheRef.current.set(sceneId, data);
        setSceneData(data);
        setCurrentSceneId(sceneId);
        setActiveShotIndex(0);
        setPlaying(false);
      }
      setLoading(false);
    },
    [projectId]
  );

  const changeScene = React.useCallback(
    (direction: 1 | -1) => {
      const index = scenes.findIndex((s) => s.id === currentSceneId);
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= scenes.length) return;
      loadScene(scenes[nextIndex].id);
    },
    [scenes, currentSceneId, loadScene]
  );

  const shots = sceneData?.shots ?? [];
  const clampedIndex = Math.min(activeShotIndex, Math.max(0, shots.length - 1));
  const activeShot = shots[clampedIndex];

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveShotIndex((i) => Math.max(0, i - 1)); // clamps at the scene's first shot — no wrap into the previous scene
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveShotIndex((i) => Math.min(shots.length - 1, i + 1)); // clamps at the last shot — no wrap into the next scene
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        changeScene(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        changeScene(1);
      } else if (e.key === "a" || e.key === "A") {
        setAllSetupsMode((v) => !v);
      } else if (e.key === " ") {
        e.preventDefault();
        const hasMovement = Boolean(activeShot?.setup.movementPath) || Boolean(activeShot?.actors.some((a) => (a.path?.length ?? 0) >= 2));
        if (hasMovement) setPlaying((v) => !v);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shots.length, changeScene, activeShot]);

  if (!sceneData || shots.length === 0) {
    return (
      <div className="flex h-full">
        <SceneList scenes={scenes} currentSceneId={currentSceneId} onSelect={loadScene} />
        <div className="flex-1 p-10">
          <EmptyState
            icon={<Camera className="h-6 w-6" />}
            title={sceneData?.set ? "No shots drafted yet" : "This scene has no set yet"}
            description={
              sceneData?.set
                ? "Ask the blocking agent to cover this scene, or draft shots by hand."
                : "Add a set before the agent can block shots, or ask it to start one."
            }
          />
        </div>
        <BlockingAgentPanel
          projectId={projectId}
          initialHistory={initialChatHistory}
          viewingLabel={sceneData ? `Scene ${sceneData.scene.number}` : ""}
          activeSceneId={currentSceneId}
          activeShotId={null}
        />
      </div>
    );
  }

  return (
    <OverheadWorkspaceBody
      projectId={projectId}
      initialChatHistory={initialChatHistory}
      sceneData={sceneData}
      scenes={scenes}
      currentSceneId={currentSceneId}
      loading={loading}
      onSelectScene={loadScene}
      activeShot={activeShot}
      activeShotIndex={clampedIndex}
      onSetActiveShotIndex={setActiveShotIndex}
      allSetupsMode={allSetupsMode}
      onToggleAllSetups={() => setAllSetupsMode((v) => !v)}
      playing={playing}
      onTogglePlay={() => setPlaying((v) => !v)}
      shots={shots}
    />
  );
}

function OverheadWorkspaceBody({
  projectId,
  initialChatHistory,
  sceneData,
  scenes,
  currentSceneId,
  loading,
  onSelectScene,
  activeShot,
  activeShotIndex,
  onSetActiveShotIndex,
  allSetupsMode,
  onToggleAllSetups,
  playing,
  onTogglePlay,
  shots,
}: {
  projectId: string;
  initialChatHistory: ChatTurn[];
  sceneData: OverheadSceneData;
  scenes: OverheadSceneSummary[];
  currentSceneId: string;
  loading: boolean;
  onSelectScene: (id: string) => void;
  activeShot: NonNullable<OverheadSceneData["shots"][number]>;
  activeShotIndex: number;
  onSetActiveShotIndex: (i: number) => void;
  allSetupsMode: boolean;
  onToggleAllSetups: () => void;
  playing: boolean;
  onTogglePlay: () => void;
  shots: OverheadSceneData["shots"];
}) {
  const transition = useShotTransition(activeShot);
  const playback = usePlayMovement(activeShot, playing, onTogglePlay);
  const activeOverride = playback ?? transition;
  const hasMovement = Boolean(activeShot.setup.movementPath) || activeShot.actors.some((a) => (a.path?.length ?? 0) >= 2);

  if (!sceneData.set) {
    return (
      <div className="flex h-full">
        <SceneList scenes={scenes} currentSceneId={currentSceneId} onSelect={onSelectScene} />
        <div className="flex-1 p-10">
          <EmptyState icon={<Camera className="h-6 w-6" />} title="This scene has no set yet" description="Add a set before the agent can block shots, or ask it to start one." />
        </div>
        <BlockingAgentPanel
          projectId={projectId}
          initialHistory={initialChatHistory}
          viewingLabel={`Scene ${sceneData.scene.number}`}
          activeSceneId={currentSceneId}
          activeShotId={null}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full", loading && "opacity-60")}>
      <SceneList scenes={scenes} currentSceneId={currentSceneId} onSelect={onSelectScene} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-zinc-100 px-5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{activeShot.label}</span>
            <span className="text-sm text-zinc-600">{activeShot.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={allSetupsMode ? "secondary" : "outline"} onClick={onToggleAllSetups}>
              All setups
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onTogglePlay}
              disabled={!hasMovement}
              title={hasMovement ? undefined : "This shot has no camera move or actor path to play"}
            >
              <Play className="h-3.5 w-3.5" /> {playing ? "Stop" : "Play"}
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center p-5">
          <OverheadCanvas
            set={sceneData.set}
            shots={shots}
            characters={sceneData.characters}
            activeShotId={activeShot.id}
            allSetupsMode={allSetupsMode}
            sensorWidthMm={24.9}
            activeOverride={activeOverride}
          />
        </div>

        <div className="flex-shrink-0 border-t border-zinc-100 bg-[var(--color-background)] px-6 py-3.5">
          <div className="text-sm font-semibold">
            {activeShot.label} — {activeShot.title}
          </div>
          <div className="mt-2 flex gap-1.5">
            {[`${activeShot.setup.lensMm}mm`, activeShot.setup.height, activeShot.setup.support, shotSizeLabel(activeShot.shotSize)].map(
              (pill) => (
                <span key={pill} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                  {pill}
                </span>
              )
            )}
          </div>
          <div className="mt-2 flex gap-4">
            <div className="text-[12.5px] text-zinc-500">
              Lines{" "}
              <span className="font-medium text-zinc-900">
                {activeShot.linesCovered.start}
                {activeShot.linesCovered.end !== activeShot.linesCovered.start ? `–${activeShot.linesCovered.end}` : ""}
              </span>
            </div>
            {activeShot.note && <div className="text-[12.5px] italic text-zinc-500">{activeShot.note}</div>}
          </div>
        </div>

        <div className="flex h-[62px] flex-shrink-0 items-center gap-2 overflow-x-auto border-t border-zinc-100 bg-[var(--color-background)] px-6">
          {shots.map((shot, i) => (
            <button
              key={shot.id}
              type="button"
              onClick={() => onSetActiveShotIndex(i)}
              className={cn(
                "flex h-[42px] w-[78px] flex-shrink-0 flex-col items-start justify-center gap-0.5 rounded-lg border px-2.5",
                i === activeShotIndex ? "border-accent-500 bg-accent-50" : "border-zinc-200 bg-white"
              )}
            >
              <span className={cn("text-xs font-bold", i === activeShotIndex ? "text-accent-700" : "text-zinc-800")}>{shot.label}</span>
              <span className={cn("text-[9.5px]", i === activeShotIndex ? "text-accent-600" : "text-zinc-400")}>
                {shotSizeLabel(shot.shotSize)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <BlockingAgentPanel
        projectId={projectId}
        initialHistory={initialChatHistory}
        viewingLabel={activeShot.label}
        activeSceneId={currentSceneId}
        activeShotId={activeShot.id}
      />
    </div>
  );
}

function SceneList({
  scenes,
  currentSceneId,
  onSelect,
}: {
  scenes: OverheadSceneSummary[];
  currentSceneId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-[220px] flex-shrink-0 overflow-y-auto border-r border-zinc-100 py-4">
      <div className="px-4 pb-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Scenes</div>
      <div className="flex flex-col">
        {scenes.map((scene) => {
          const active = scene.id === currentSceneId;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSelect(scene.id)}
              className={cn(
                "flex items-center justify-between px-4 py-2.5 text-left text-[13px]",
                active ? "border-l-[3px] border-accent-500 bg-accent-50 pl-[13px] font-semibold text-accent-700" : "text-zinc-600"
              )}
            >
              <span className="truncate">
                {scene.number} — {scene.locationName ?? "Untitled location"}
              </span>
              {scene.shotCount > 0 && (
                <span className="ml-2 flex-shrink-0 rounded-full bg-white px-1.5 text-[11px] font-semibold text-accent-600">
                  {scene.shotCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shotSizeLabel(size: string): string {
  return size
    .split("_")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
