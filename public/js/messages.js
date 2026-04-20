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
  const logoutBtn = document.getElementById("logoutBtn");

  let conversations = [];
  let listingsById = {};
  let selectedConversationId = localStorage.getItem("activeConversationId") || null;
  let sending = false;

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("jwtToken");
      localStorage.removeItem("activeConversationId");
      localStorage.removeItem("messageListingTitle");
      window.location.href = "/";
    });
  }

  init();

  async function init() {
    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const [conversationRes, listingsRes] = await Promise.all([
        fetch("/api/conversations", { headers: { Authorization: token } }),
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
      conversationView.innerHTML = `<div class="empty-state">Could not load messages right now.</div>`;
      composeStatus.textContent = "Unable to load chat.";
    }
  }

  async function hydrateConversationSummaries() {
    const hydrated = await Promise.all(
      conversations.map(async (conversation) => {
        const conversationId = String(conversation.conversation_id);
        const otherEmail = getOtherParticipantEmail(conversation);

        const [messages, tradeOffers] = await Promise.all([
          fetchMessages(conversationId, false),
          fetchTradeOffers(conversationId, false)
        ]);

        const combinedItems = [
          ...messages.map((message) => ({
            type: "message",
            created_at: message.created_at,
            text: message.message_text || "",
            fromOtherUser: message.sender_email !== currentUserEmail
          })),
          ...tradeOffers.map((offer) => ({
            type: "trade",
            created_at: offer.created_at,
            text: `Trade offer: ${getListingTitle(offer.offered_listing_id)} for ${getListingTitle(offer.requested_listing_id)}`,
            fromOtherUser: offer.offered_by_email !== currentUserEmail
          }))
        ].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

        const lastItem = combinedItems.length ? combinedItems[combinedItems.length - 1] : null;

        const unreadCount = messages.filter(
          (message) => message.sender_email !== currentUserEmail && Number(message.is_read) === 0
        ).length;

        const listing = listingsById[String(conversation.listing_id)] || null;

        return {
          ...conversation,
          conversation_id: conversationId,
          otherEmail,
          otherName: getDisplayNameFromEmail(otherEmail),
          listingTitle: listing?.title || localStorage.getItem("messageListingTitle") || "Item",
          listingDescription: listing?.description || "",
          lastMessageText: lastItem?.text || "",
          lastMessageAt: lastItem?.created_at || conversation.updated_at,
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
        <div class="conversation-item-top">
          <strong>${escapeHtml(conversation.otherName)}</strong>
          <span>${formatDate(conversation.lastMessageAt)}</span>
        </div>
        <div class="conversation-item-sub">${escapeHtml(conversation.otherEmail)}</div>
        <div class="conversation-item-preview">
          ${conversation.lastMessageText ? escapeHtml(conversation.lastMessageText) : "No messages yet."}
        </div>
        <div class="conversation-item-bottom">
          <span>${escapeHtml(conversation.listingTitle || "Item")}</span>
          ${conversation.unreadCount > 0 ? `<span class="unread-badge">${conversation.unreadCount}</span>` : ""}
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
      <div>${escapeHtml(conversation.otherEmail)}</div>
      <div><strong>About:</strong> ${escapeHtml(conversation.listingTitle || "Item")}</div>
      ${conversation.listingDescription ? `<div>${escapeHtml(conversation.listingDescription)}</div>` : ""}
    `;

    input.disabled = false;
    sendBtn.disabled = false;
    composeStatus.textContent = "Send a message in this conversation.";

    await loadConversationMessages(selectedConversationId);
  }

  async function loadConversationMessages(conversationId) {
    conversationView.innerHTML = `<div class="empty-state">Loading conversation...</div>`;

    try {
      const [messages, tradeOffers] = await Promise.all([
        fetchMessages(conversationId, true),
        fetchTradeOffers(conversationId, false)
      ]);

      renderConversationFeed(messages, tradeOffers);

      const unreadIncoming = messages.filter(
        (message) => message.sender_email !== currentUserEmail && Number(message.is_read) === 0
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

      if (convo) convo.unreadCount = 0;

      renderInbox();
    } catch (error) {
      console.error("Error loading conversation:", error);
      conversationView.innerHTML = `<div class="empty-state">Failed to load conversation.</div>`;
    }
  }

  async function fetchMessages(conversationId, throwOnError = true) {
    const response = await fetch(`/api/conversations/${conversationId}/messages`, {
      headers: { Authorization: token }
    });

    if (!response.ok) {
      if (throwOnError) {
        throw new Error(`Messages request failed with status ${response.status}`);
      }
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async function fetchTradeOffers(conversationId, throwOnError = true) {
    const response = await fetch(`/api/conversations/${conversationId}/trade-offers`, {
      headers: { Authorization: token }
    });

    if (!response.ok) {
      if (throwOnError) {
        throw new Error(`Trade request failed with status ${response.status}`);
      }
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  function renderConversationFeed(messages, tradeOffers) {
    const messageItems = (messages || []).map((message) => ({
      type: "message",
      created_at: message.created_at,
      data: message
    }));

    const tradeItems = (tradeOffers || []).map((offer) => ({
      type: "trade",
      created_at: offer.created_at,
      data: offer
    }));

    const items = [...messageItems, ...tradeItems].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
    );

    if (!items.length) {
      conversationView.innerHTML = `<div class="empty-state">No messages or trade offers yet.</div>`;
      return;
    }

    conversationView.innerHTML = "";

    items.forEach((item) => {
      if (item.type === "message") {
        renderMessageRow(item.data);
      } else {
        renderTradeCard(item.data);
      }
    });

    conversationView.scrollTop = conversationView.scrollHeight;
  }

  function renderMessageRow(message) {
    const isSent = message.sender_email === currentUserEmail;
    const row = document.createElement("div");
    row.className = `message-row ${isSent ? "sent" : "received"}`;

    row.innerHTML = `
      <div class="message-bubble">
        <div class="message-text">${escapeHtml(message.message_text || "")}</div>
        <div class="message-meta">
          ${isSent ? "You" : escapeHtml(getDisplayNameFromEmail(message.sender_email))}
          • ${formatDate(message.created_at, true)}
        </div>
      </div>
    `;

    conversationView.appendChild(row);
  }

  function renderTradeCard(offer) {
    const requested = listingsById[String(offer.requested_listing_id)];
    const offered = listingsById[String(offer.offered_listing_id)];
    const isOfferSender = offer.offered_by_email === currentUserEmail;
    const requestedOwner = requested?.user_email || requested?.seller_email || requested?.email;
    const isRequestedOwner = requestedOwner === currentUserEmail;

    const card = document.createElement("div");
    card.className = "trade-card";

    let actionsHtml = "";

    if ((offer.status || "Pending") === "Pending" && isRequestedOwner) {
      actionsHtml = `
        <button class="btn trade-action-btn" data-action="accept" data-id="${offer.trade_offer_id}">
          Accept
        </button>
        <button class="btn btn-danger trade-action-btn" data-action="decline" data-id="${offer.trade_offer_id}">
          Decline
        </button>
      `;
    } else if ((offer.status || "Pending") === "Pending" && isOfferSender) {
      actionsHtml = `
        <button class="btn btn-secondary trade-action-btn" data-action="cancel" data-id="${offer.trade_offer_id}">
          Cancel
        </button>
      `;
    }

    card.innerHTML = `
      <div class="trade-card-header">
        <span class="trade-badge">Trade Offer</span>
        <span class="trade-status trade-status-${String(offer.status || "Pending").toLowerCase()}">
          ${escapeHtml(offer.status || "Pending")}
        </span>
      </div>

      <div class="trade-card-body">
        <div><strong>Requested item:</strong> ${escapeHtml(requested?.title || `Listing #${offer.requested_listing_id}`)}</div>
        <div><strong>Offered item:</strong> ${escapeHtml(offered?.title || `Listing #${offer.offered_listing_id}`)}</div>
        ${
          offer.message_text
            ? `<div class="trade-message"><strong>Message:</strong> ${escapeHtml(offer.message_text)}</div>`
            : ""
        }
        <div class="trade-meta">
          ${escapeHtml(getDisplayNameFromEmail(offer.offered_by_email || ""))} • ${formatDate(offer.created_at, true)}
        </div>
      </div>

      ${actionsHtml ? `<div class="trade-card-actions">${actionsHtml}</div>` : ""}
    `;

    card.querySelectorAll(".trade-action-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleTradeAction(btn.dataset.id, btn.dataset.action));
    });

    conversationView.appendChild(card);
  }

  async function handleTradeAction(tradeOfferId, action) {
    try {
      let url = "";
      let options = {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        }
      };

      if (action === "accept") {
        url = `/api/trade-offers/${tradeOfferId}/respond`;
        options.body = JSON.stringify({ status: "Accepted" });
      } else if (action === "decline") {
        url = `/api/trade-offers/${tradeOfferId}/respond`;
        options.body = JSON.stringify({ status: "Declined" });
      } else if (action === "cancel") {
        url = `/api/trade-offers/${tradeOfferId}/cancel`;
      }

      const response = await fetch(url, options);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Trade action failed.");
      }

      await hydrateConversationSummaries();
      renderInbox();
      await loadConversationMessages(selectedConversationId);
    } catch (error) {
      console.error("Trade action error:", error);
      alert(error.message || "Could not update trade offer.");
    }
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (sending || !selectedConversationId) return;

    const text = input.value.trim();
    if (!text) return;

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
        body: JSON.stringify({ message_text: text })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not send message.");
      }

      input.value = "";
      composeStatus.textContent = "Message sent.";

      await hydrateConversationSummaries();
      renderInbox();
      await loadConversationMessages(selectedConversationId);
    } catch (error) {
      console.error("Send message error:", error);
      composeStatus.textContent = error.message || "Could not send message.";
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  });

  function renderNoConversationsState() {
    conversationHeading.textContent = "Conversation";
    conversationMeta.innerHTML = "";
    conversationView.innerHTML = `<div class="empty-state">No conversations yet.</div>`;
    input.disabled = true;
    sendBtn.disabled = true;
    composeStatus.textContent = "Start a conversation from a listing by clicking Message Seller.";
  }

  function renderNoConversationSelectedState() {
    conversationHeading.textContent = "Conversation";
    conversationMeta.innerHTML = "";
    conversationView.innerHTML = `<div class="empty-state">No conversation selected.</div>`;
    input.disabled = true;
    sendBtn.disabled = true;
    composeStatus.textContent = "Choose a conversation to start chatting.";
  }

  function getOtherParticipantEmail(conversation) {
    const candidates = [
      conversation.other_user_email,
      conversation.user_one_email,
      conversation.user_two_email,
      conversation.buyer_email,
      conversation.seller_email
    ].filter(Boolean);

    for (const email of candidates) {
      if (String(email).toLowerCase() !== String(currentUserEmail || "").toLowerCase()) {
        return email;
      }
    }

    return candidates[0] || "Unknown";
  }

  function getDisplayNameFromEmail(email) {
    if (!email) return "User";
    const username = String(email).split("@")[0] || "User";
    return username
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function getListingTitle(listingId) {
    return listingsById[String(listingId)]?.title || `Listing #${listingId}`;
  }

  function parseJwtEmail(jwtToken) {
    if (!jwtToken) return "";
    try {
      const payload = JSON.parse(atob(jwtToken.split(".")[1]));
      return payload.email || payload.user_email || "";
    } catch (error) {
      return "";
    }
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {})
    });
  }
});