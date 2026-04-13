document.addEventListener("DOMContentLoaded", async () => {
    const conversationId = localStorage.getItem("activeConversationId");
    const inbox = document.getElementById("inboxList");
    const conversationView = document.getElementById("conversationView");
    const form = document.getElementById("sendMessageForm");
    const input = document.getElementById("messageInput");
  
    if (!conversationId) {
      conversationView.textContent = "No conversation selected.";
      return;
    }
  
    try {
      // Load messages for selected conversation
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        headers: {
          "Authorization": localStorage.getItem("jwtToken")
        }
      });
  
      const messages = await res.json();
  
      renderMessages(messages);
  
    } catch (err) {
      console.error("Error loading messages:", err);
      conversationView.textContent = "Failed to load messages.";
    }
  
    function renderMessages(messages) {
      conversationView.innerHTML = "";
  
      if (!messages.length) {
        conversationView.textContent = "No messages yet.";
        return;
      }
  
      messages.forEach(msg => {
        const div = document.createElement("div");
        div.textContent = `${msg.sender_email}: ${msg.message_text}`;
        conversationView.appendChild(div);
      });
    }
  
    // Send message
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
  
      const text = input.value.trim();
      if (!text) return;
  
      try {
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": localStorage.getItem("jwtToken")
          },
          body: JSON.stringify({ text })
        });
  
        input.value = "";
  
        // reload messages
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          headers: {
            "Authorization": localStorage.getItem("jwtToken")
          }
        });
  
        const messages = await res.json();
        renderMessages(messages);
  
      } catch (err) {
        console.error("Send message error:", err);
      }
    });
  });