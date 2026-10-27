// The full text of every reading in the program, keyed by lesson id.
import { READINGS_LAUNCH } from './program-readings-launch.js'
import { READINGS_UNSTICK } from './program-readings-unstick.js'
import { READINGS_EXPLORE } from './program-readings-explore.js'
import { READINGS_RECHARGE } from './program-readings-recharge.js'

export const READINGS = { ...READINGS_LAUNCH, ...READINGS_UNSTICK, ...READINGS_EXPLORE, ...READINGS_RECHARGE }
