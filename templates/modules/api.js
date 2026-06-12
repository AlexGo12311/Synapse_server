import { state } from './state.js';

export async function fetchUsers() {
    const res = await fetch("http://localhost:8080/users", { 
        headers: { "Authorization": "Bearer " + state.token } 
    });
    return res.json();
}

export async function fetchLastMessages() {
    const res = await fetch("http://localhost:8080/last-messages", { 
        headers: { "Authorization": "Bearer " + state.token } 
    });
    if (!res.ok) return [];
    return res.json();
}

export async function fetchHistory(target) {
    const res = await fetch(`http://localhost:8080/history?to=${target}`, { 
        headers: { "Authorization": "Bearer " + state.token } 
    });
    return res.json();
}

export async function registerUser(username, password) {
    return fetch("http://localhost:8080/register", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ username, password }) 
    });
}

export async function loginUser(username, password) {
    return fetch("http://localhost:8080/login", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ username, password }) 
    });
}