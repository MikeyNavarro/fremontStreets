/** Input extract: OSM node identity is the sole authority for connections. */
export type LonLat = [number, number];
export interface RoadWay {
  id: string | number;
  nodes: Array<string | number>;
  name?: string;
  highway?: string;
  oneway?: string | number | boolean;
  maxspeed?: string | number;
  tags?: Record<string, string>;
  [key: string]: unknown;
}
export interface RoadRestriction {
  id?: string | number;
  fromWay: string | number;
  toWay: string | number;
  viaNode?: string | number;
  viaWays?: Array<string | number>;
  restriction: string;
  tags?: Record<string, string>;
}
export interface RoadData {
  metadata?: Record<string, unknown>;
  nodes: Record<string, LonLat>;
  ways: RoadWay[];
  restrictions?: RoadRestriction[];
  unsupportedRestrictions?: Array<Partial<RoadRestriction> & { id?: string | number; reason?: string }>;
}
export interface RoadNode {
  id: string;
  position: LonLat;
  x: number;
  y: number;
}
export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  wayId: string;
  name: string;
  highway: string;
  length: number;
  heading: number;
  speedLimitMph: number | null;
  /** Source motorcar/motor_vehicle/access tag, when supplied. */
  access?: string;
}
export interface RoadGraph {
  nodes: Map<string, RoadNode>;
  edges: Map<string, RoadEdge>;
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
  restrictions: RoadRestriction[];
  warnings: string[];
  metadata: Record<string, unknown>;
}
export type Turn = 'left' | 'right' | 'straight' | 'uturn';
export type AccelerationProfile = 'NORMAL' | 'QUICK' | 'SPORT';
export interface TurnChoice {
  edgeId: string;
  kind: Turn;
  angle: number;
  name: string;
  nodeId: string;
}
export interface VehicleEvent {
  type: 'street' | 'intersection' | 'node';
  id: string;
  name?: string;
  edgeId?: string;
}
/** Speed is metres/second. Heading is radians clockwise from geographic north. */
export interface VehicleState {
  edgeId: string;
  distance: number;
  speed: number;
  position: LonLat;
  metric: { x: number; y: number };
  heading: number;
  pendingTurn: Turn | null;
  previousEdgeId: string | null;
  totalDistance: number;
  events: VehicleEvent[];
}
export interface DrivingInput {
  throttle: number | boolean;
  brake: number | boolean;
  turn?: Turn;
}
export interface SimulationOptions {
  profile?: AccelerationProfile;
  maxSpeedMph?: number;
  /** Optional practice aid; only known source limits can be enforced. */
  obeyKnownSpeedLimits?: boolean;
  /** Reduced corner speed is an aid, not an assertion of traffic control. */
  cornerAssist?: boolean;
}
export interface Route {
  nodeIds: string[];
  edgeIds: string[];
  distance: number;
}
export type CameraMode = 'overhead' | 'driver';
export interface GameState {
  vehicle: VehicleState;
  camera: CameraMode;
  activeRoute: Route | null;
  zoneId: string;
}
