import { env } from "../config/env.js";
import { AIWIZCHAT_PROVIDER_STATUSES } from "../constants/whatsapp.constants.js";
import { maskPhone, normalizePhone } from "../utils/phone.js";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 422]);
const REQUEST_TIMEOUT_MS = 15000;

const logEvent = (event, details = {}) => {
  console.log(JSON.stringify({ event, provider: "AIWIZCHAT", ...details }));
};

const getProviderMessageId = (payload) =>
  payload?.data?.message?.id ||
  payload?.data?.messageId ||
  payload?.data?.id ||
  payload?.message?.id ||
  payload?.id ||
  null;

const getProviderStatus = (payload) =>
  payload?.data?.message?.status ||
  payload?.data?.status ||
  payload?.status ||
  (payload?.success ? AIWIZCHAT_PROVIDER_STATUSES.ACCEPTED : null);

const parseErrorPayload = async (response) => {
  try {
    const payload = await response.json();
    return {
      payload,
      message: payload?.message || payload?.error?.message || payload?.error || `AiWizChat returned ${response.status}`,
      code: String(payload?.code || payload?.error?.code || response.status),
    };
  } catch {
    return {
      payload: null,
      message: `AiWizChat returned ${response.status}`,
      code: String(response.status),
    };
  }
};

export const validateAiwizchatConfig = () => {
  if (!env.whatsappEnabled) {
    return { valid: true, enabled: false };
  }

  const missing = [
    ["AIWIZCHAT_API_BASE_URL", env.aiwizchatApiBaseUrl],
    ["AIWIZCHAT_API_KEY", env.aiwizchatApiKey],
    ["AIWIZCHAT_PURCHASE_CAMPAIGN_NAME", env.aiwizchatPurchaseCampaignName],
    ["AIWIZCHAT_ABANDONED_CAMPAIGN_NAME", env.aiwizchatAbandonedCampaignName],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    return {
      valid: false,
      enabled: true,
      missing,
      message: `AiWizChat configuration missing: ${missing.join(", ")}`,
    };
  }

  return { valid: true, enabled: true };
};

export const validateAiwizchatTransportConfig = () => {
  if (!env.whatsappEnabled) {
    return { valid: false, enabled: false, message: "WhatsApp automation is disabled." };
  }

  const missing = [
    ["AIWIZCHAT_API_BASE_URL", env.aiwizchatApiBaseUrl],
    ["AIWIZCHAT_API_KEY", env.aiwizchatApiKey],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    return {
      valid: false,
      enabled: true,
      missing,
      message: `AiWizChat configuration missing: ${missing.join(", ")}`,
    };
  }

  return { valid: true, enabled: true };
};

export const sendCampaignMessage = async ({ to, campaignName, variables, correlation }) => {
  const phone = normalizePhone(to);
  if (!phone) {
    return {
      ok: false,
      retryable: false,
      statusCode: 400,
      errorCode: "INVALID_PHONE",
      errorMessage: "Invalid WhatsApp phone number.",
    };
  }

  const config = validateAiwizchatTransportConfig();
  if (!config.valid) {
    return {
      ok: false,
      retryable: false,
      statusCode: 500,
      errorCode: "AIWIZCHAT_CONFIG_MISSING",
      errorMessage: config.message,
    };
  }

  if (!campaignName) {
    return {
      ok: false,
      retryable: false,
      statusCode: 500,
      errorCode: "AIWIZCHAT_CAMPAIGN_MISSING",
      errorMessage: "AiWizChat campaign name is not configured.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${env.aiwizchatApiBaseUrl}/api/integrations/campaigns/send`;
  const body = {
    campaignName,
    recipients: [
      {
        to: phone.replace(/^\+/, ""),
        variables,
      },
    ],
  };

  logEvent("whatsapp.provider.request", {
    ...correlation,
    phone: maskPhone(phone),
    campaignName,
    variableCount: variables.length,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": env.aiwizchatApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await parseErrorPayload(response);
      return {
        ok: false,
        retryable: RETRYABLE_STATUS_CODES.has(response.status) && !NON_RETRYABLE_STATUS_CODES.has(response.status),
        statusCode: response.status,
        errorCode: error.code,
        errorMessage: error.message,
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      statusCode: response.status,
      providerMessageId: getProviderMessageId(payload),
      providerStatus: getProviderStatus(payload),
      payload,
    };
  } catch (error) {
    const timeoutError = error?.name === "AbortError";
    return {
      ok: false,
      retryable: true,
      statusCode: 0,
      errorCode: timeoutError ? "TIMEOUT" : "NETWORK_ERROR",
      errorMessage: timeoutError ? "AiWizChat request timed out." : "AiWizChat network request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
};
