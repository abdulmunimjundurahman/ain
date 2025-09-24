import {
  Constants,
  isAgentsEndpoint,
  tQueryParamsSchema,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TConversation, TPreset } from 'librechat-data-provider';

const allowedParams = Object.keys(tQueryParamsSchema.shape);
export default function createChatSearchParams(
  input: TConversation | TPreset | Record<string, string> | null,
): URLSearchParams {
  try {
    console.groupCollapsed('[createChatSearchParams] input');
    console.log('raw input:', input);
  } catch (_) {}
  if (input == null) {
    try {
      console.log('result: empty params (null input)');
      console.groupEnd?.();
    } catch (_) {}
    return new URLSearchParams();
  }

  const params = new URLSearchParams();

  if (input && typeof input === 'object' && !('endpoint' in input) && !('model' in input)) {
    Object.entries(input as Record<string, string>).forEach(([key, value]) => {
      if (value != null && allowedParams.includes(key)) {
        params.set(key, value);
      }
    });
    try {
      console.log('record-only branch output:', params.toString());
      console.groupEnd?.();
    } catch (_) {}
    return params;
  }

  const conversation = input as TConversation | TPreset;
  const endpoint = conversation.endpoint;
  // For param endpoints (agents/assistants), prefer identifier params over `spec`
  if (
    isAgentsEndpoint(endpoint) &&
    conversation.agent_id &&
    conversation.agent_id !== Constants.EPHEMERAL_AGENT_ID
  ) {
    const out = new URLSearchParams({ agent_id: String(conversation.agent_id) });
    try {
      console.log('agents branch -> agent_id only:', out.toString());
      console.groupEnd?.();
    } catch (_) {}
    return out;
  } else if (isAssistantsEndpoint(endpoint) && conversation.assistant_id) {
    const out = new URLSearchParams({ assistant_id: String(conversation.assistant_id) });
    try {
      console.log('assistants branch -> assistant_id only:', out.toString());
      console.groupEnd?.();
    } catch (_) {}
    return out;
  } else if (isAgentsEndpoint(endpoint) && !conversation.agent_id) {
    try {
      console.log('agents branch with no agent_id -> empty params');
      console.groupEnd?.();
    } catch (_) {}
    return params;
  } else if (isAssistantsEndpoint(endpoint) && !conversation.assistant_id) {
    try {
      console.log('assistants branch with no assistant_id -> empty params');
      console.groupEnd?.();
    } catch (_) {}
    return params;
  }
  if (conversation.spec) {
    const out = new URLSearchParams({ spec: conversation.spec });
    try {
      console.log('spec branch output:', out.toString());
      console.groupEnd?.();
    } catch (_) {}
    return out;
  }

  if (endpoint) {
    params.set('endpoint', endpoint);
  }
  if (conversation.model) {
    params.set('model', conversation.model);
  }

  const paramMap: Record<string, any> = {};
  allowedParams.forEach((key) => {
    if (key === 'agent_id' && conversation.agent_id === Constants.EPHEMERAL_AGENT_ID) {
      return;
    }
    if (key !== 'endpoint' && key !== 'model') {
      paramMap[key] = (conversation as any)[key];
    }
  });

  const result = Object.entries(paramMap).reduce((params, [key, value]) => {
    if (value != null) {
      if (Array.isArray(value)) {
        params.set(key, key === 'stop' ? value.join(',') : JSON.stringify(value));
      } else {
        params.set(key, String(value));
      }
    }

    return params;
  }, params);
  try {
    console.log('default branch output:', result.toString());
    console.groupEnd?.();
  } catch (_) {}
  return result;
}
