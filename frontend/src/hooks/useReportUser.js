import { useState } from "react";

export const useReportUser = () => {
  const [isReporting, setIsReporting] = useState(false);
  const [reportError, setReportError] = useState(null);

  const reportUser = async (userId, chatId, reason = null, messageId = null) => {
    setIsReporting(true);
    setReportError(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/report/user/${userId}/chat/${chatId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("accessToken") || localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ reason, messageId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit report");
      }

      return {
        success: true,
        pendingAdminReview: true,
        message: data.data?.message || "Report submitted — pending admin review.",
      };
    } catch (error) {
      setReportError(error.message);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      setIsReporting(false);
    }
  };

  return { reportUser, isReporting, reportError };
};
