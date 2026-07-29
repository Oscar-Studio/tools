export interface Tool {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  icon?: string;
  featured?: boolean;
  subject?: string[];
  demoFile: string;
  prefill?: {
    params?: string[];
    description?: string;
  };
}

export interface ToolsConfig {
  tools: Tool[];
}