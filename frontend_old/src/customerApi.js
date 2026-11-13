
const BASE = import.meta.env.VITE_API_BASE || "";
const KEY = "vestro_customer_token";

export const hasCustomerToken = () =>
  !!localStorage.getItem(KEY);

export const setCustomerToken = (token) => {
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
};

async function request(method, path, body) {
  const headers = {
    "Content-Type": "application/json",
  };

  const token = localStorage.getItem(KEY);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach Vestro Bank. Please try again.");
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Response may be empty.
  }

  if (!response.ok) {
    if (response.status === 401) {
      setCustomerToken(null);
    }

    throw new Error(
      data?.detail ||
      data?.message ||
      data?.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

export const customerApi = {
  login: (username, password) =>
    request("POST", "/api/portal/customer/login", {
      username,
      password,
    }),

  dashboard: () =>
    request("GET", "/api/portal/customer/dashboard"),

  transfer: (payment) =>
    request("POST", "/api/portal/customer/payments/", payment),
};
