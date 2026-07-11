export type CandleResolution = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export interface BidAskOhlc {
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface LighterCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  V?: number;
  bid?: BidAskOhlc;
  ask?: BidAskOhlc;
  volumeSynthetic?: boolean;
}
