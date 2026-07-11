import type { LighterCandle } from "@/lib/lighter/client";
import {
  aggregateCandles,
  buildChannelFromStructure,
  type ChannelLines,
  mapToStructureIndex,
} from "../indicators/channel-geometry";
import { buildChannelEpisodes, channelEpisodeAt, type ChannelEpisode } from "../indicators/channel-episodes";
import { buildQuadStochKdStack, buildQuadStochStack, type QuadStochKdStack, type QuadStochStack } from "../indicators/stochastic-quad";
import { buildSessionVwap } from "../indicators/session-vwap";

function emaSeries(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < values.length; i++) {
    if (i === 0) out.push(values[0]!);
    else out.push(values[i]! * k + out[i - 1]! * (1 - k));
  }
  return out;
}

export interface KuriskoDualTfContext {
  candlesStruct: LighterCandle[];
  stackExec: QuadStochStack;
  stackStruct: QuadStochStack;
  stackExecKd: QuadStochKdStack;
  stackStructKd: QuadStochKdStack;
  channel: ChannelLines;
  channelEpisodes: ChannelEpisode[];
  ema20: number[];
  ema50: number[];
  ema200: number[];
  sessionVwap: number[];
  isNewDay: boolean[];
  structurePeriodMs: number;
}

export function buildDualTfContext(
  candlesExec: LighterCandle[],
  structurePeriodMs: number
): KuriskoDualTfContext {
  const candlesStruct = aggregateCandles(candlesExec, structurePeriodMs);
  const stackExecKd = buildQuadStochKdStack(candlesExec);
  const stackStructKd = buildQuadStochKdStack(candlesStruct);
  const stackExec = buildQuadStochStack(candlesExec);
  const stackStruct = buildQuadStochStack(candlesStruct);
  const channelEpisodes = buildChannelEpisodes(candlesStruct, structurePeriodMs);
  const channel = candlesExec.length
    ? channelAtTimeFromEpisodes(channelEpisodes, candlesExec[candlesExec.length - 1]!.t)
    : buildChannelFromStructure(candlesStruct);
  const closes = candlesExec.map((c) => c.c);
  const { sessionVwap, isNewDay } = buildSessionVwap(candlesExec);
  return {
    candlesStruct,
    stackExec,
    stackStruct,
    stackExecKd,
    stackStructKd,
    channel,
    channelEpisodes,
    ema20: emaSeries(closes, 20),
    ema50: emaSeries(closes, 50),
    ema200: emaSeries(closes, 200),
    sessionVwap,
    isNewDay,
    structurePeriodMs,
  };
}

export function structureIndexAt(ctx: KuriskoDualTfContext, tsExec: number): number {
  return mapToStructureIndex(ctx.candlesStruct, tsExec, ctx.structurePeriodMs);
}

const noChannel: ChannelLines = {
  valid: false,
  direction: "none",
  upperAt: () => 0,
  lowerAt: () => 0,
  midAt: () => 0,
};

function channelAtTimeFromEpisodes(episodes: ChannelEpisode[], ts: number): ChannelLines {
  const ep = channelEpisodeAt(episodes, ts);
  if (!ep) return noChannel;
  return {
    valid: true,
    direction: ep.kind,
    upperAt: ep.upperAt,
    lowerAt: ep.lowerAt,
    midAt: (t) => (ep.upperAt(t) + ep.lowerAt(t)) / 2,
    pivots: ep.pivots,
    slopeDeg: ep.slopeDeg,
  };
}

export function channelAtTime(ctx: KuriskoDualTfContext, tsExec: number): ChannelLines {
  return channelAtTimeFromEpisodes(ctx.channelEpisodes, tsExec);
}
