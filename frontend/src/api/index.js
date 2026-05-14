import api from "./axios";

export const register = (data) => api.post("/auth/register", data);
export const login = (data) => api.post("/auth/login", data);
export const logout = () => api.post("/auth/logout");

export const getUsers = (params = {}) => api.get("/users", { params });
export const getUserById = (id) => api.get(`/users/${id}`);
export const getModules = () => api.get("/users/modules");

export const getChats = (userId) => api.get("/chats", { params: { userId } });
export const getChatById = (id) => api.get(`/chats/${id}`);
export const createChat = (data) => api.post("/chats", data);
export const replyPrivately = (messageId) => api.post(`/chats/reply-privately/${messageId}`);
export const deleteOrLeaveChat = (id, userId) =>
  api.delete(`/chats/${id}`, { data: { userId } });
export const deleteGroupChat = (id, userId) =>
  api.delete(`/chats/${id}/group`, { data: { userId } });
export const addMemberToChat = (chatId, userId) =>
  api.post(`/chats/${chatId}/members`, { userId });
export const removeMemberFromChat = (chatId, userId) =>
  api.delete(`/chats/${chatId}/members/${userId}`);

export const getMessages = (chatId, cursor = null, limit = 20) =>
  api.get(`/messages`, { params: { chatId, cursor, limit } });
export const createPoll = (data) => api.post("/messages/poll", data);
export const votePoll = (messageId, data) =>
  api.post(`/poll/vote`, { messageId, ...data });
export const addReaction = (data) => api.post(`/reactions`, data);
export const removeReaction = (data) => api.delete(`/reactions`, { data });
export const markSeen = (messageId, userId) =>
  api.post(`/seen`, { messageId, userId });
export const markChatAsSeen = (chatId, userId) =>
  api.post(`/seen/batch`, { chatId, userId });
export const deleteMessage = (id, userId) =>
  api.delete(`/messages/${id}`, { data: { userId } });
export const editMessage = (id, data) =>
  api.patch(`/messages/${id}`, data);
export const reportMessage = (messageId) =>
  api.post(`/messages/${messageId}/report`);

export const uploadImage = (formData) =>
  api.post("/upload/image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
export const uploadFile = (formData) =>
  api.post("/upload/file", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
export const uploadVoice = (formData) =>
  api.post("/upload/voice", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

