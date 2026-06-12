import { state, constants } from './state.js';

export function attachSwipeToMessage(row) {
    let startX = 0, startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isDecided = false;
    let isHorizontal = false;
    let startedOnButton = false;
    
    const bubble = row.querySelector('.bubble');
    const swipeIcon = bubble ? bubble.querySelector('.swipe-reply-icon') : null;
    if (!bubble) return;
    
    function setTransform(x) {
        bubble.style.transform = x === 0 ? '' : `translate3d(${x}px, 0, 0)`;
        if (swipeIcon) {
            const isReady = row.classList.contains('swipe-ready');
            const baseScale = isReady ? 'scale(1.15) rotate(-15deg)' : 'scale(0.5)';
            const compensation = x === 0 ? '' : ` translateX(${-x}px)`;
            swipeIcon.style.transform = `translateY(-50%)${compensation} ${baseScale}`;
        }
    }
    
    function startDrag() {
        row.classList.add('swiping');
    }
    
    function endDrag(targetX, onDone) {
        row.classList.remove('swiping');
        requestAnimationFrame(() => {
            setTransform(targetX);
        });
        if (onDone) {
            setTimeout(onDone, 380);
        }
    }
    
    function onStart(clientX, clientY, target) {
        if (target.closest('.reply-btn')) {
            startedOnButton = true;
            return;
        }
        startedOnButton = false;
        startX = clientX;
        startY = clientY;
        currentX = 0;
        isDragging = true;
        isDecided = false;
        isHorizontal = false;
        startDrag();
        setTransform(0);
    }
    
    function onMove(clientX, clientY, preventDefault) {
        if (!isDragging || startedOnButton) return;
        const diffX = clientX - startX;
        const diffY = clientY - startY;
        
        if (!isDecided && (Math.abs(diffX) > 5 || Math.abs(diffY) > 5)) {
            isDecided = true;
            isHorizontal = Math.abs(diffX) > Math.abs(diffY) * constants.MIN_HORIZONTAL_RATIO;
            if (isHorizontal) {
                document.body.classList.add('is-dragging');
            } else {
                isDragging = false;
                endDrag(0);
            }
        }
        
        if (!isDecided || !isHorizontal) return;
        if (preventDefault) preventDefault();
        
        if (diffX < 0) {
            const absDiff = Math.abs(diffX);
            const capped = Math.min(absDiff, 120);
            const finalDiff = absDiff > 80 ? 80 + (capped - 80) * 0.5 : capped;
            currentX = -finalDiff;
            setTransform(currentX);
            if (absDiff > constants.SWIPE_THRESHOLD * 0.75) row.classList.add('swipe-ready');
            else row.classList.remove('swipe-ready');
        } else {
            const rubber = Math.min(Math.abs(diffX) * 0.25, 20);
            currentX = rubber;
            setTransform(currentX);
            row.classList.remove('swipe-ready');
        }
    }
    
    function onEnd() {
        if (!isDragging) return;
        const wasHorizontal = isHorizontal;
        const wasSwipeReady = row.classList.contains('swipe-ready');
        const finalX = currentX;
        
        isDragging = false;
        document.body.classList.remove('is-dragging');
        
        if (!wasHorizontal || startedOnButton) {
            endDrag(0);
            row.classList.remove('swipe-ready');
            return;
        }
        
        if (finalX < -constants.SWIPE_THRESHOLD && wasSwipeReady) {
            endDrag(-50, () => {
                const msgId = row.dataset.msgId;
                if (msgId) {
                    const msg = state.messagesMap.get(msgId);
                    if (msg) {
                        state.replyingTo = msg;
                        const preview = document.getElementById('replyPreview');
                        if (preview) {
                            document.getElementById('replyPreviewName').textContent = msg.fromUsername;
                            document.getElementById('replyPreviewText').textContent = msg.text || '🔒 Encrypted';
                            preview.style.display = 'flex';
                            const input = document.getElementById('messageInput');
                            if (input) input.focus();
                        }
                    }
                }
                startDrag();
                setTransform(0);
                requestAnimationFrame(() => {
                    endDrag(0);
                });
            });
        } else {
            endDrag(0);
        }
        
        row.classList.remove('swipe-ready');
    }
    
    row.addEventListener('touchstart', (e) => {
        onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    
    row.addEventListener('touchmove', (e) => {
        if (!isDragging || !isHorizontal) return;
        onMove(e.touches[0].clientX, e.touches[0].clientY, () => { 
            try { e.preventDefault(); } catch(_) {} 
        });
    }, { passive: false });
    
    row.addEventListener('touchend', onEnd);
    row.addEventListener('touchcancel', onEnd);
    
    row.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        onStart(e.clientX, e.clientY, e.target);
    });
    
    function onMouseMoveGlobal(e) {
        if (!isDragging) return;
        onMove(e.clientX, e.clientY, () => e.preventDefault());
    }
    
    function onMouseUpGlobal() {
        if (!isDragging) return;
        onEnd();
    }
    
    document.addEventListener('mousemove', onMouseMoveGlobal);
    document.addEventListener('mouseup', onMouseUpGlobal);
    
    row.addEventListener('dragstart', (e) => e.preventDefault());
    row.addEventListener('selectstart', (e) => { if (isDragging) e.preventDefault(); });
}