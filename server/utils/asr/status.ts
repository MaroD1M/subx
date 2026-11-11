import type { AppConfig } from '../../../types'

type AsrConfig = Pick<AppConfig, 'asrModel' | 'asrDevice' | 'asrComputeType' | 'asrEngine'>

export function mergeAsrHealth(config: AsrConfig, health: unknown) {
  if (!health || typeof health !== 'object' || Array.isArray(health)) return health
  const reported = health as Record<string, any>
  return {
    ...reported,
    serviceModel: reported.model,
    model: String(config.asrModel || reported.model || ''),
    device: config.asrDevice && config.asrDevice !== 'auto' ? config.asrDevice : reported.device,
    computeType: config.asrComputeType || reported.computeType,
    serviceEngine: reported.engine,
    engine: config.asrEngine && config.asrEngine !== 'auto' ? config.asrEngine : reported.engine
  }
}
