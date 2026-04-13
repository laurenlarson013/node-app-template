document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("jwtToken");
  const currentUserEmail = parseJwtEmail(token);

  const inboxList = document.getElementById("inboxList");
  const inboxStatus = document.getElementById("inboxStatus");
  const conversationView = document.getElementById("conversationView");
  const conversationHeading = document.getElementById("conversationHeading");
  const conversationMeta = document.getElementById("conversationMeta");
  const form = document.getElementById("sendMessageForm");
  const input = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendMessageBtn");
  const composeStatus = document.getElementById("composeStatus");

  let conversations = [];
  let listingsById = {};
  let selectedConversationId = localStorage.getItem("activeConversationId") || null;
  let sending = false;

  init();

  async function init() {
    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const [conversationRes, listingsRes] = await Promise.all([
        fetch("/api/conversations", {
          headers: { Authorization: token }
        }),
        fetch("/api/listings")
      ]);

      if (!conversationRes.ok) {
        throw new Error("Could not load conversations.");
      }

      conversations = await conversationRes.json();

      if (listingsRes.ok) {
        const listings = await listingsRes.json();
        listingsById = Object.fromEntries(
          (Array.isArray(listings) ? listings : []).map((listing) => [
            String(listing.listing_id),
            listing
          ])
        );
      }

      await hydrateConversationSummaries();
      renderInbox();

      if (conversations.length === 0) {
        renderNoConversationsState();
        return;
      }

      const selectedStillExists = conversations.some(
        (conversation) => String(conversation.conversation_id) === String(selectedConversationId)
      );

      if (!selectedStillExists) {
        selectedConversationId = String(conversations[0].conversation_id);
      }

      await selectConversation(selectedConversationId);
    } catch (error) {
      console.error("Messages init error:", error);
      inboxStatus.textContent = "Could not load conversations.";
      conversationView.innerHTML = `<div class="messages-error">Could not load messages right now.</div>`;
      composeStatus.textContent = "Unable to load chat.";
    }
  }

  async function hydrateConversationSummaries() {
    const hydrated = await Promise.all(
      conversations.map(async (conversation) => {
        const conversationId = String(conversation.conversation_id);
        const otherEmail = getOtherParticipantEmail(conversation);
        const messages = await fetchMessages(conversationId, false);

        const lastMessage = messages.length ? messages[messages.length - 1] : null;
        const unreadCount = messages.filter(
          (message) =>
            message.sender_email !== currentUserEmail &&
            Number(message.is_read) === 0
        ).length;

        const listing = listingsById[String(conversation.listing_id)] || null;

        return {
          ...conversation,
          conversation_id: conversationId,
          otherEmail,
          otherName: getDisplayNameFromEmail(otherEmail),
          listingTitle: listing?.title || localStorage.getItem("messageListingTitle") || "Item",
          listingDescription: listing?.description || "",
          lastMessageText: lastMessage?.message_text || "",
          lastMessageAt: lastMessage?.created_at || conversation.updated_at,
          unreadCount
        };
      })
    );

    conversations = hydrated.sort(
      (a, b) => new Date(b.lastMessageAt || b.updated_at || 0) - new Date(a.lastMessageAt || a.updated_at || 0)
    );
  }

  function renderInbox() {
    inboxList.innerHTML = "";

    if (!conversations.length) {
      inboxStatus.style.display = "block";
      inboxStatus.textContent = "No conversations yet.";
      return;
    }

    inboxStatus.style.display = "none";

    conversations.forEach((conversation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item";
      if (String(conversation.conversation_id) === String(selectedConversationId)) {
        button.classList.add("active");
      }

      button.innerHTML = `
        <div class="conversation-topline">
          <div>
            <div class="conversation-name">${escapeHtml(conversation.otherName)}</div>
            <div class="conversation-email">${escapeHtml(conversation.otherEmail)}</div>
          </div>
          <div class="conversation-date">${formatDate(conversation.lastMessageAt)}</div>
        </div>

        <div class="conversation-preview">
          ${conversation.lastMessageText
            ? escapeHtml(conversation.lastMessageText)
            : "No messages yet."}
        </div>

        <div class="conversation-meta" style="margin-top:10px;">
          <div class="conversation-email">${escapeHtml(conversation.listingTitle || "Item")}</div>
          <div>
            ${conversation.unreadCount > 0 ? `<span class="unread-badge" title="Unread"></span>` : ""}
          </div>
        </div>
      `;

      button.addEventListener("click", async () => {
        await selectConversation(conversation.conversation_id);
      });

      inboxList.appendChild(button);
    });
  }

  async function selectConversation(conversationId) {
    selectedConversationId = String(conversationId);
    localStorage.setItem("activeConversationId", selectedConversationId);
    renderInbox();

    const conversation = conversations.find(
      (item) => String(item.conversation_id) === String(selectedConversationId)
    );

    if (!conversation) {
      renderNoConversationSelectedState();
      return;
    }

    conversationHeading.textContent = conversation.otherName;
    conversationMeta.innerHTML = `
      <span>${escapeHtml(conversation.otherEmail)}</span>
      <span class="listing-pill">About: ${escapeHtml(conversation.listingTitle || "Item")}</span>
    `;

    if (conversation.listingDescription) {
      conversationMeta.innerHTML += `
        <span style="color: var(--muted);">${escapeHtml(conversation.listingDescription)}</span>
      `;
    }

    input.disabled = false;
    sendBtn.disabled = false;
    composeStatus.textContent = "Send a message in this conversation.";

    await loadConversationMessages(selectedConversationId);
  }

  async function loadConversationMessages(conversationId) {
    conversationView.innerHTML = `<div class="messages-empty">Loading messages...</div>`;

    try {
      const messages = await fetchMessages(conversationId, true);
      renderMessages(messages);

      const unreadIncoming = messages.filter(
        (message) =>
          message.sender_email !== currentUserEmail &&
          Number(message.is_read) === 0
      );

      await Promise.all(
        unreadIncoming.map((message) =>
          fetch(`/api/messages/${message.message_id}/read`, {
            method: "PUT",
            headers: { Authorization: token }
          }).catch(() => null)
        )
      );

      const convo = conversations.find(
        (item) => String(item.conversation_id) === String(conversationId)
      );
      if (convo) {
        convo.unreadCount = 0;
      }
      renderInbox();
    } catch (error) {
      console.error("Error loading conversation:", error);
      conversationView.innerHTML = `<div class="messages-error">Failed to load messages.</div>`;
    }
  }

  function renderMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      conversationView.innerHTML = `<div class="messages-empty">No messages yet.</div>`;
      return;
    }

    conversationView.innerHTML = "";

    messages.forEach((message) => {
      const isSent = message.sender_email === currentUserEmail;

      const row = document.createElement("div");
      row.className = `message-row ${isSent ? "sent" : "received"}`;

      row.innerHTML = `
        <div class="message-bubble">
          <div>${escapeHtml(message.message_text || "")}</div>
          <div class="message-meta">
            ${isSent ? "You" : escapeHtml(getDisplayNameFromEmail(message.sender_email))}
            • ${formatDate(message.created_at, true)}
          </div>
        </div>
      `;

      conversationView.appendChild(row);
    });

    conversationView.scrollTop = conversationView.scrollHeight;
  }

  function renderNoConversationsState() {
    conversationHeading.textContent = "Conversation";
    conversationMeta.innerHTML = "";
    conversationView.innerHTML = `<div class="messages-empty">No conversations yet.</div>`;
    input.disabled = true;
    sendBtn.disabled = true;
    composeStatus.textContent = "Start a conversation from a listing by clicking Message Seller.";
  }

  function renderNoConversationSelectedState() {
    conversationHeading.textContent = "Conversation";
    conversationMeta.innerHTML = "";
    conversationView.innerHTML = `<div class="messages-empty">No conversation selected.</div>`;
    input.disabled = true;
    sendBtn.disabled = true;
    composeStatus.textContent = "Choose a conversation to start chatting.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedConversationId || sending) return;

    const messageText = input.value.trim();
    if (!messageText) return;

    sending = true;
    sendBtn.disabled = true;
    composeStatus.textContent = "Sending...";

    try {
      const response = await fetch(`/api/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({ messageText })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Failed to send message.");
      }

      input.value = "";
      composeStatus.textContent = "Message sent.";

      await refreshAfterSend(selectedConversationId);
    } catch (error) {
      console.error("Send message error:", error);
      composeStatus.textContent = error.message || "Could not send message.";
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  });

  async function refreshAfterSend(conversationId) {
    const messages = await fetchMessages(conversationId, true);
    renderMessages(messages);

    const convo = conversations.find(
      (item) => String(item.conversation_id) === String(conversationId)
    );

    if (convo) {
      const last = messages[messages.length - 1];
      convo.lastMessageText = last?.message_text || convo.lastMessageText;
      convo.lastMessageAt = last?.created_at || new Date().toISOString();
      convo.unreadCount = 0;
    }

    conversations.sort(
      (a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
    );
    renderInbox();
  }

  async function fetchMessages(conversationId, throwOnError = true) {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      headers: { Authorization: token }
    });

    if (!response.ok) {
      if (throwOnError) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  function getOtherParticipantEmail(conversation) {
    if (!currentUserEmail) {
      return conversation.user_one_email || conversation.user_two_email || "Unknown user";
    }

    return conversation.user_one_email === currentUserEmail
      ? conversation.user_two_email
      : conversation.user_one_email;
  }

  function getDisplayNameFromEmail(email) {
    if (!email) return "Unknown user";

    const localPart = email.split("@")[0] || "";
    return localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return includeTime
      ? date.toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        })
      : date.toLocaleDateString([], {
          month: "short",
          day: "numeric"
        });
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
  }

  function parseJwtEmail(jwtToken) {
    if (!jwtToken) return "";

    try {
      const payload = JSON.parse(atob(jwtToken.split(".")[1]));
      return payload.email || "";
    } catch (error) {
      return "";
    }
  }
});