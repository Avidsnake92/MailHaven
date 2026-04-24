const axios = require('axios');

let cachedToken = null;
let tokenExpiry = null;

const getToken = async () => {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const response = await axios.post(`${process.env.OPENARCHIVER_API_URL}/v1/auth/login`, {
    email: process.env.OPENARCHIVER_EMAIL,
    password: process.env.OPENARCHIVER_PASSWORD,
  });

  cachedToken = response.data.accessToken || response.data.token;
  tokenExpiry = Date.now() + 6 * 60 * 60 * 1000;
  return cachedToken;
};

const oaRequest = async (method, path, data = null, params = null) => {
  const token = await getToken();
  const config = {
    method,
    url: `${process.env.OPENARCHIVER_API_URL}/v1${path}`,
    headers: { Authorization: `Bearer ${token}` },
  };
  if (data) config.data = data;
  if (params) config.params = params;

  const response = await axios(config);
  return response.data;
};

const getEmails = async (params = {}) => {
  return oaRequest('get', '/archived-emails', null, params);
};

const getEmailsBySource = async (sourceId, params = {}) => {
  return oaRequest('get', `/archived-emails/ingestion-source/${sourceId}`, null, params);
};

const getEmail = async (id) => {
  return oaRequest('get', `/archived-emails/${id}`);
};

const searchEmails = async (query, params = {}) => {
  return oaRequest('get', '/search', null, { q: query, ...params });
};

const getSources = async () => {
  return oaRequest('get', '/ingestion-sources');
};

const createSource = async (name, host, port, username, password, tls = true, allowInsecureTls = false) => {
  return oaRequest('post', '/ingestion-sources', {
    name,
    provider: 'generic_imap',
    providerConfig: { host, port: parseInt(port), username, password, tls, allowInsecureTls }
  });
};

const deleteSource = async (sourceId) => {
  return oaRequest('delete', `/ingestion-sources/${sourceId}`);
};

const updateSource = async (sourceId, data) => {
  return oaRequest('put', `/ingestion-sources/${sourceId}`, data);
};

module.exports = { getEmails, getEmailsBySource, getEmail, searchEmails, getSources, oaRequest, createSource, deleteSource, updateSource };
