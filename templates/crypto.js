// ===== ГЛОБАЛЬНОЕ СОСТОЯНИЕ КРИПТОГРАФИИ =====
let rsaKeys = null;
let publicKeyBase64 = null;

function generateMessageId() {
    return crypto.randomUUID();
}

// ===== BASE64 КОНВЕРТЕРЫ =====
function toB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(str) {
    const bin = atob(str);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
}

// ===== ИНИЦИАЛИЗАЦИЯ RSA КЛЮЧЕЙ =====
async function initRSA(userId) {
    const keyName = "rsaKeys_" + userId;
    const saved = localStorage.getItem(keyName);

    if (saved) {
        const p = JSON.parse(saved);
        rsaKeys = {
            privateKey: await crypto.subtle.importKey(
                "jwk", p.privateKey,
                { name: "RSA-OAEP", hash: "SHA-256" },
                true, ["decrypt"]
            ),
            publicKey: await crypto.subtle.importKey(
                "spki", fromB64(p.publicKey),
                { name: "RSA-OAEP", hash: "SHA-256" },
                true, ["encrypt"]
            )
        };
        publicKeyBase64 = p.publicKey;
        return "loaded";
    }

    rsaKeys = await crypto.subtle.generateKey({
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
    }, true, ["encrypt", "decrypt"]);

    const pub = await crypto.subtle.exportKey("spki", rsaKeys.publicKey);
    const priv = await crypto.subtle.exportKey("jwk", rsaKeys.privateKey);

    publicKeyBase64 = toB64(pub);
    localStorage.setItem(keyName, JSON.stringify({
        publicKey: publicKeyBase64,
        privateKey: priv
    }));
    return "generated";
}

// ===== ШИФРОВАНИЕ (DUAL ENCRYPTION) =====
async function encryptDual(text, receiverPubKey) {
    const aes = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aes,
        new TextEncoder().encode(text)
    );

    const rawAES = await crypto.subtle.exportKey("raw", aes);

    const keyReceiver = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        receiverPubKey,
        rawAES
    );

    const keySender = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        rsaKeys.publicKey,
        rawAES
    );

    return {
        data: toB64(cipher),
        iv: toB64(iv),
        key_sender: toB64(keySender),
        key_receiver: toB64(keyReceiver)
    };
}

// ===== ДЕШИФРОВАНИЕ =====
async function decryptMessage(msg, currentUserId) {
    try {
        const keyToUse = (msg.from === currentUserId) ? msg.key_sender : msg.key_receiver;

        const aesRaw = await crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            rsaKeys.privateKey,
            fromB64(keyToUse)
        );

        const aes = await crypto.subtle.importKey(
            "raw",
            aesRaw,
            { name: "AES-GCM" },
            true,
            ["decrypt"]
        );

        const plain = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fromB64(msg.iv) },
            aes,
            fromB64(msg.data)
        );

        return new TextDecoder().decode(plain);
    } catch (e) {
        console.error("Decrypt error:", e);
        return null;
    }
}

// ===== FINGERPRINT КЛЮЧА =====
async function generateKeyFingerprint(pubKeyBase64) {
    if (!pubKeyBase64) return { short: "—", full: "—" };
    
    try {
        const keyData = fromB64(pubKeyBase64);
        const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        
        const hexString = hashArray.slice(0, 20)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
        
        const groups = [];
        for (let i = 0; i < hexString.length; i += 5) {
            groups.push(hexString.slice(i, i + 5));
        }
        
        return {
            short: groups.slice(0, 4).join(' '),
            full: groups.join(' '),
            raw: hexString
        };
    } catch (e) {
        console.error("Fingerprint error:", e);
        return { short: "—", full: "—", raw: "" };
    }
}

async function getMyFingerprint() {
    return await generateKeyFingerprint(publicKeyBase64);
}

// ИСПРАВЛЕНО: используем window.publicKeys вместо локального publicKeys
async function getPeerFingerprint(peerId) {
    const peerKey = window.publicKeys ? window.publicKeys[peerId] : null;
    if (!peerKey) return null;
    
    try {
        const spkiBuffer = await crypto.subtle.exportKey("spki", peerKey);
        const pubKeyB64 = toB64(spkiBuffer);
        return await generateKeyFingerprint(pubKeyB64);
    } catch (e) {
        console.error("Peer fingerprint error:", e);
        return null;
    }
}

// ===== ГЛОБАЛЬНЫЕ ЭКСПОРТЫ =====
window.initRSA = initRSA;
window.encryptDual = encryptDual;
window.decryptMessage = decryptMessage;
window.generateMessageId = generateMessageId;
window.toB64 = toB64;
window.fromB64 = fromB64;
window.getMyFingerprint = getMyFingerprint;
window.getPeerFingerprint = getPeerFingerprint;

Object.defineProperty(window, 'publicKeyBase64', {
    get: function() { return publicKeyBase64; }
});