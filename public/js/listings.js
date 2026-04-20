let allListings = [];
let activeListing = null;
let myListingsCache = [];
let activeConversationIdForTrade = null;

const DEFAULT_IMAGE = "/images/default.jpg";

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  setupModalEvents();
  setupMessageSeller();
  setupTradeButton();
  setupTradeModalEvents();
  loadListings();
});

function setupEventListeners() {
  const applyBtn = document.getElementById("applyFiltersBtn");
  const clearBtn = document.getElementById("clearFiltersBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchInput = document.getElementById("searchInput");

  if (applyBtn) {
    applyBtn.addEventListener("click", applyFilters);
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", clearFilters);
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        applyFilters();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("jwtToken");
      localStorage.removeItem("activeConversationId");
      localStorage.removeItem("messageListingTitle");
      window.location.href = "/";
    });
  }
}

function getCurrentUserEmail() {
  const token = localStorage.getItem("jwtToken");
  if (!token) return "";

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (payload.email || payload.user_email || "").toLowerCase();
  } catch (error) {
    console.error("Could not read user email from token:", error);
    return "";
  }
}

async function loadListings() {
  const statusEl = document.getElementById("listingsStatus");
  const container = document.getElementById("listingsContainer");

  if (!statusEl || !container) return;

  statusEl.textContent = "Loading listings...";
  statusEl.style.display = "block";
  container.innerHTML = "";

  try {
    const response = await fetch("/api/listings");

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Invalid listings response format.");
    }

    const currentUserEmail = getCurrentUserEmail();

    allListings = data.filter((listing) => {
      const listingOwnerEmail = (
        listing.user_email ||
        listing.seller_email ||
        listing.email ||
        ""
      ).toLowerCase();

      return listingOwnerEmail !== currentUserEmail;
    });

    renderListings(allListings);
  } catch (error) {
    console.error("Error loading listings:", error);
    statusEl.textContent = "Could not load listings. Please try again.";
    statusEl.style.display = "block";
  }
}

function applyFilters() {
  const searchValue = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const categoryValue = document.getElementById("categoryFilter")?.value || "All";
  const sortValue = document.getElementById("sortFilter")?.value || "newest";
  const maxPriceValue = document.getElementById("priceFilter")?.value.trim() || "";

  let filtered = [...allListings];

  if (searchValue) {
    filtered = filtered.filter((listing) => {
      const title = (listing.title || "").toLowerCase();
      const description = (listing.description || "").toLowerCase();
      const category = (listing.category || "").toLowerCase();
      const university = (listing.university || "").toLowerCase();

      return (
        title.includes(searchValue) ||
        description.includes(searchValue) ||
        category.includes(searchValue) ||
        university.includes(searchValue)
      );
    });
  }

  if (categoryValue !== "All") {
    filtered = filtered.filter((listing) => (listing.category || "") === categoryValue);
  }

  if (maxPriceValue) {
    const maxPrice = Number(maxPriceValue);
    filtered = filtered.filter((listing) => Number(listing.price) <= maxPrice);
  }

  if (sortValue === "price-low") {
    filtered.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sortValue === "price-high") {
    filtered.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  renderListings(filtered);
}

function clearFilters() {
  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const sortFilter = document.getElementById("sortFilter");
  const priceFilter = document.getElementById("priceFilter");

  if (searchInput) searchInput.value = "";
  if (categoryFilter) categoryFilter.value = "All";
  if (sortFilter) sortFilter.value = "newest";
  if (priceFilter) priceFilter.value = "";

  renderListings(allListings);
}

function renderListings(listings) {
  const container = document.getElementById("listingsContainer");
  const statusEl = document.getElementById("listingsStatus");

  if (!container || !statusEl) return;

  container.innerHTML = "";

  if (!listings.length) {
    statusEl.textContent = "No listings match your filters.";
    statusEl.style.display = "block";
    return;
  }

  statusEl.style.display = "none";

  listings.forEach((listing) => {
    const card = document.createElement("article");
    card.className = "listing-card";
    card.dataset.id = listing.listing_id;

    const imageSrc = getListingImage(listing.photos);
    const price = formatPrice(listing.price);
    const category = listing.category || "Listing";
    const title = listing.title || "Untitled Listing";
    const description = listing.description || "No description provided.";
    const sellerName = listing.seller_name || "Unknown seller";
    const sellerUniversity = listing.seller_university || listing.university || "";
    const tradeOption = listing.trade_option || "Sell";

    card.innerHTML = `
      <img class="listing-thumb" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(title)}" />
      <div class="listing-card-body">
        <div class="listing-badges">
          <span class="pill">${escapeHtml(category)}</span>
          <span class="pill">${escapeHtml(tradeOption)}</span>
        </div>
        <h3 class="listing-title">${escapeHtml(title)}</h3>
        <div class="listing-price">${price}</div>
        <p class="listing-description">${escapeHtml(description)}</p>
        <div class="listing-seller">
          <strong>${escapeHtml(sellerName)}</strong>
          ${sellerUniversity ? `<span>${escapeHtml(sellerUniversity)}</span>` : ""}
        </div>
      </div>
    `;

    const img = card.querySelector("img");
    if (img) {
      img.addEventListener("error", () => {
        img.src = DEFAULT_IMAGE;
      });
    }

    card.addEventListener("click", () => {
      openListingModal(listing);
    });

    container.appendChild(card);
  });
}

function getListingImage(photos) {
  if (!photos) return DEFAULT_IMAGE;

  if (typeof photos === "string") {
    const trimmed = photos.trim();

    if (
      trimmed.startsWith("data:image/") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("/")
    ) {
      return trimmed;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]) {
        return parsed[0];
      }
    } catch (error) {
      return DEFAULT_IMAGE;
    }
  }

  if (Array.isArray(photos) && photos.length > 0 && photos[0]) {
    return photos[0];
  }

  return DEFAULT_IMAGE;
}

function formatPrice(price) {
  const number = Number(price);
  if (Number.isNaN(number)) return "Price unavailable";
  return `$${number.toFixed(2)}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}

function listingAllowsTrade(listing) {
  const value = (listing?.trade_option || "").toLowerCase();
  return value.includes("trade");
}

function openListingModal(listing) {
  activeListing = listing;

  const modal = document.getElementById("listingModal");
  if (!modal) return;

  const image = document.getElementById("modalImage");
  const category = document.getElementById("modalCategory");
  const trade = document.getElementById("modalTrade");
  const title = document.getElementById("modalTitle");
  const price = document.getElementById("modalPrice");
  const description = document.getElementById("modalDescription");
  const condition = document.getElementById("modalCondition");
  const university = document.getElementById("modalUniversity");
  const pickup = document.getElementById("modalPickup");
  const seller = document.getElementById("modalSeller");
  const tradeBtn = document.getElementById("offerTradeBtn");

  const imageSrc = getListingImage(listing.photos);

  if (image) {
    image.src = imageSrc;
    image.alt = listing.title || "Listing image";
    image.onerror = () => {
      image.src = DEFAULT_IMAGE;
    };
  }

  if (category) category.textContent = listing.category || "Listing";
  if (trade) trade.textContent = listing.trade_option || "For Sale";
  if (title) title.textContent = listing.title || "Untitled Listing";
  if (price) price.textContent = formatPrice(listing.price);
  if (description) description.textContent = listing.description || "No description provided.";
  if (condition) condition.textContent = listing.item_condition || "Not listed";
  if (university) university.textContent = listing.seller_university || listing.university || "Not listed";
  if (pickup) pickup.textContent = listing.pickup_details || "Not listed";
  if (seller) seller.textContent = listing.seller_name || "Unknown seller";

  if (tradeBtn) {
    tradeBtn.style.display = listingAllowsTrade(listing) ? "inline-flex" : "none";
  }

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeListingModal() {
  const modal = document.getElementById("listingModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function setupModalEvents() {
  const closeBtn = document.getElementById("listingModalClose");
  const backdrop = document.getElementById("listingModalBackdrop");

  closeBtn?.addEventListener("click", closeListingModal);
  backdrop?.addEventListener("click", closeListingModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeListingModal();
      closeTradeModal();
    }
  });
}

function setupMessageSeller() {
  const messageBtn = document.getElementById("messageSellerBtn");
  if (!messageBtn) return;

  messageBtn.addEventListener("click", async () => {
    if (!activeListing) {
      alert("No listing selected.");
      return;
    }

    const token = localStorage.getItem("jwtToken");
    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const recipientEmail =
        activeListing.user_email || activeListing.seller_email || activeListing.email;

      if (!recipientEmail) {
        throw new Error("Seller email not found for this listing.");
      }

      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({
          recipientEmail,
          listingId: activeListing.listing_id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to start conversation.");
      }

      const conversationId = data.conversation_id || data.conversationId || data.id;

      if (!conversationId) {
        throw new Error("Conversation created, but no conversation ID returned.");
      }

      localStorage.setItem("activeConversationId", conversationId);
      localStorage.setItem("messageListingTitle", activeListing.title || "");
      window.location.href = "/messages";
    } catch (error) {
      console.error("Message Seller error:", error);
      alert(error.message || "Could not start conversation.");
    }
  });
}

function setupTradeButton() {
  const tradeBtn = document.getElementById("offerTradeBtn");
  if (!tradeBtn) return;

  tradeBtn.addEventListener("click", async () => {
    if (!activeListing) {
      alert("No listing selected.");
      return;
    }

    if (!listingAllowsTrade(activeListing)) {
      alert("This listing is not accepting trades.");
      return;
    }

    const token = localStorage.getItem("jwtToken");
    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const recipientEmail =
        activeListing.user_email || activeListing.seller_email || activeListing.email;

      if (!recipientEmail) {
        throw new Error("Seller email not found.");
      }

      const convoRes = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({
          recipientEmail,
          listingId: activeListing.listing_id
        })
      });

      const convoData = await convoRes.json().catch(() => ({}));

      if (!convoRes.ok) {
        throw new Error(convoData.message || "Could not start trade conversation.");
      }

      activeConversationIdForTrade =
        convoData.conversation_id || convoData.conversationId || convoData.id;

      await openTradeModal();
    } catch (error) {
      console.error("Trade setup error:", error);
      alert(error.message || "Could not open trade offer.");
    }
  });
}

async function openTradeModal() {
  const modal = document.getElementById("tradeModal");
  const select = document.getElementById("tradeListingSelect");
  const status = document.getElementById("tradeStatus");
  const summary = document.getElementById("tradeTargetSummary");
  const token = localStorage.getItem("jwtToken");

  if (!modal || !select || !status || !summary) return;

  summary.textContent = `Requested item: ${activeListing?.title || "Listing"}`;
  status.textContent = "Loading your listings...";
  status.style.display = "block";
  select.innerHTML = `<option value="">Select a listing</option>`;

  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  try {
    const res = await fetch("/api/my-listings", {
      headers: { Authorization: token }
    });

    const data = await res.json().catch(() => []);

    if (!res.ok) {
      throw new Error(data.message || "Could not load your listings.");
    }

    myListingsCache = Array.isArray(data) ? data : [];
    console.log("my listings returned:", myListingsCache);

    const eligibleListings = myListingsCache.filter((listing) => {
      const statusValue = String(listing.status || "").toLowerCase();

      return (
        String(listing.listing_id) !== String(activeListing?.listing_id) &&
        statusValue !== "sold"
      );
    });

    console.log("eligible trade listings:", eligibleListings);

    if (!eligibleListings.length) {
      status.textContent = "You do not have any other available listings to trade.";
      return;
    }

    eligibleListings.forEach((listing) => {
      const option = document.createElement("option");
      option.value = listing.listing_id;
      option.textContent = `${listing.title || "Untitled Listing"} — ${formatPrice(listing.price)}`;
      select.appendChild(option);
    });

    status.style.display = "none";
  } catch (error) {
    console.error("trade modal error:", error);
    status.textContent = error.message || "Could not load your listings.";
  }
}

function closeTradeModal() {
  const modal = document.getElementById("tradeModal");
  const form = document.getElementById("tradeOfferForm");
  const status = document.getElementById("tradeStatus");

  modal?.classList.add("hidden");
  document.body.classList.remove("modal-open");
  form?.reset();

  if (status) {
    status.textContent = "";
    status.style.display = "none";
  }
}

function setupTradeModalEvents() {
  document.getElementById("tradeModalClose")?.addEventListener("click", closeTradeModal);
  document.getElementById("tradeModalBackdrop")?.addEventListener("click", closeTradeModal);
  document.getElementById("cancelTradeModalBtn")?.addEventListener("click", closeTradeModal);
  document.getElementById("tradeOfferForm")?.addEventListener("submit", submitTradeOffer);
}

async function submitTradeOffer(event) {
  event.preventDefault();

  const token = localStorage.getItem("jwtToken");
  const select = document.getElementById("tradeListingSelect");
  const messageInput = document.getElementById("tradeMessageInput");
  const status = document.getElementById("tradeStatus");
  const submitBtn = document.getElementById("submitTradeOfferBtn");

  const offeredListingId = select?.value;
  const messageText = messageInput?.value.trim() || "";

  if (!offeredListingId) {
    status.textContent = "Please choose one of your listings.";
    status.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  status.textContent = "Sending trade offer...";
  status.style.display = "block";

  try {
    const res = await fetch("/api/trade-offers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token
      },
      body: JSON.stringify({
        conversation_id: activeConversationIdForTrade,
        requested_listing_id: activeListing.listing_id,
        offered_listing_id: offeredListingId,
        message_text: messageText
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || "Could not send trade offer.");
    }

    localStorage.setItem("activeConversationId", activeConversationIdForTrade);
    localStorage.setItem("messageListingTitle", activeListing.title || "");
    closeTradeModal();
    closeListingModal();
    window.location.href = "/messages";
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Could not send trade offer.";
  } finally {
    submitBtn.disabled = false;
  }
}