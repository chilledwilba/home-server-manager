export interface Pool {
  name: string;
  status: string;
  capacity?: number;
  used?: number;
  available?: number;
  health: string;
  disks?: Array<{
    name: string;
    status: string;
    temperature?: number;
  }>;
}

export interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  state: string;
  image?: string;
  created?: string;
  ports?: string[];
}

export interface Alert {
  id: number;
  type: string;
  severity: string;
  message: string;
  created_at: string;
  acknowledged?: number;
  resolved?: number;
}

export interface SystemMetrics {
  cpu?: { usage: number };
  memory?: { used: number; total: number; percent: number };
  uptime?: number;
  load?: number[];
}

export interface SecurityData {
  status?: string;
  banned_ips?: string[];
  failed_attempts?: number;
}
