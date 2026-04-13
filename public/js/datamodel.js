////////////////////////////////////////////////////////////////
// DATAMODEL.JS
// THIS IS YOUR "MODEL", IT INTERACTS WITH THE ROUTES ON YOUR
// SERVER TO FETCH AND SEND DATA. IT DOES NOT INTERACT WITH
// THE VIEW OR THE CONTROLLER DIRECTLY.
// IT IS A "MIDDLEMAN" BETWEEN THE SERVER AND THE CONTROLLER.
// ALL IT DOES IS MANAGE DATA.
////////////////////////////////////////////////////////////////

const DataModel = (function () {
    // WE CAN STORE DATA HERE SO THAT WE DON'T HAVE TO FETCH IT
    // EVERY TIME WE NEED IT. THIS IS CALLED "CACHING".
    // RIGHT NOW, WE'RE STORING THE JWT TOKEN AND THE LIST OF USERS.
    const TOKEN_KEY = "jwtToken";

    let token = localStorage.getItem(TOKEN_KEY) || null; // Holds the JWT token
    let users = []; // Holds the list of user emails

    // Helper function to get token from memory or localStorage
    function getToken() {
        return token || localStorage.getItem(TOKEN_KEY);
    }

    // Helper function for making authenticated API requests
    async function request(url, options = {}) {
        const currentToken = getToken();

        if (!currentToken) {
            throw new Error("Token is not set.");
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Authorization": currentToken,
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || `Request failed: ${response.status}`);
        }

        return data;
    }

    return {
        // Utility function to store the token so that we
        // can use it later to make authenticated requests
        setToken: function (newToken) {
            token = newToken;
            localStorage.setItem(TOKEN_KEY, newToken);
        },

        // Utility function to get the token
        getToken: function () {
            return getToken();
        },

        // Function to fetch the list of users from the server
        getUsers: async function () {
            try {
                const data = await request("/api/users", {
                    method: "GET"
                });

                // Store the emails in the users variable so we can
                // use them again later without having to fetch them
                users = data.emails || [];

                // Return the emails to the controller
                return users;
            } catch (error) {
                console.error("Error fetching users:", error);
                return [];
            }
        },

        ////////////////////////////////////////////////////////////////
        // MESSAGE-RELATED FUNCTIONS
        ////////////////////////////////////////////////////////////////

        // Get all conversations for the logged-in user
        getConversations: async function () {
            try {
                return await request("/api/conversations", {
                    method: "GET"
                });
            } catch (error) {
                console.error("Error fetching conversations:", error);
                return [];
            }
        },

        // Get all messages for a specific conversation
        getMessages: async function (conversationId) {
            try {
                return await request(`/api/conversations/${conversationId}/messages`, {
                    method: "GET"
                });
            } catch (error) {
                console.error("Error fetching messages:", error);
                return [];
            }
        },

        // Create a new conversation or return an existing one
        createConversation: async function (recipientEmail, listingId) {
            try {
                return await request("/api/conversations", {
                    method: "POST",
                    body: JSON.stringify({
                        recipientEmail,
                        listingId
                    })
                });
            } catch (error) {
                console.error("Error creating conversation:", error);
                throw error;
            }
        },

        // Send a message in a conversation
        sendMessage: async function (conversationId, text) {
            try {
                return await request(`/api/conversations/${conversationId}/messages`, {
                    method: "POST",
                    body: JSON.stringify({
                        messageText: text
                    })
                });
            } catch (error) {
                console.error("Error sending message:", error);
                throw error;
            }
        },
        
        // Mark a message as read
        markMessageRead: async function (messageId) {
            try {
                return await request(`/api/messages/${messageId}/read`, {
                    method: "PUT"
                });
            } catch (error) {
                console.error("Error marking message as read:", error);
                throw error;
            }
        }

        // ADD MORE FUNCTIONS HERE TO FETCH DATA FROM THE SERVER
        // AND SEND DATA TO THE SERVER AS NEEDED
    };
})();