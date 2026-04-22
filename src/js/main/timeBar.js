(function () {
    'use strict';

    var post = document.querySelector('.post-content');
    var timeBar = document.querySelector('.time-bar');
    var shouldShow = true;

    if (post && timeBar) {
        var lastScrollTop = 0;
        var directionThreshold = 2;
        var currentDirection = 'down';

        var completed = timeBar.querySelector('.completed');
        var remaining = timeBar.querySelector('.remaining');
        var timeCompleted = timeBar.querySelector('.time-completed');
        var timeRemaining = timeBar.querySelector('.time-remaining');

        timeBar.setAttribute('data-scroll-direction', currentDirection);

        function getViewportHeight() {
            var visualViewport = window.visualViewport;
            return (visualViewport && visualViewport.height) ||
                window.innerHeight ||
                document.documentElement.clientHeight ||
                0;
        }

        function getDocumentScrollHeight() {
            var body = document.body;
            var documentElement = document.documentElement;

            return Math.max(
                body ? body.scrollHeight : 0,
                body ? body.offsetHeight : 0,
                body ? body.clientHeight : 0,
                documentElement ? documentElement.scrollHeight : 0,
                documentElement ? documentElement.offsetHeight : 0,
                documentElement ? documentElement.clientHeight : 0,
                post.scrollHeight
            );
        }

        function clampPercentage(value) {
            if (value < 0) {
                return 0;
            }

            if (value > 1) {
                return 1;
            }

            return value;
        }

        function formatTime(totalSeconds) {
            var minutes = Math.floor(totalSeconds / 60);
            var seconds = totalSeconds - (minutes * 60);

            minutes = (minutes < 10) ? '0' + minutes : minutes;
            seconds = (seconds < 10) ? '0' + seconds : seconds;

            return minutes + ':' + seconds;
        }

        function updateTimeBar() {
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            var scrollDelta = scrollTop - lastScrollTop;
            var maxScrollTop = Math.max(0, getDocumentScrollHeight() - getViewportHeight());
            var totalSeconds = parseInt(timeBar.getAttribute('data-minutes'), 10) * 60;
            var percentage = 0;
            var completedVal = 0;
            var remainingVal = 100;
            var completedTime = 0;
            var remainingTime = totalSeconds;

            if (scrollDelta > directionThreshold) {
                currentDirection = 'down';
            } else if (scrollDelta < -directionThreshold) {
                currentDirection = 'up';
            }

            timeBar.setAttribute('data-scroll-direction', currentDirection);

            shouldShow = maxScrollTop > 0;

            if (scrollTop > 0 && shouldShow) {
                timeBar.style.bottom = '0%';
            } else {
                timeBar.style.bottom = '-100%';
            }

            if (shouldShow) {
                percentage = clampPercentage(scrollTop / maxScrollTop);
                completedVal = parseFloat((percentage * 100).toFixed(2));
                remainingVal = Math.max(0, parseFloat((100 - completedVal).toFixed(2)));
                completedTime = Math.round(percentage * totalSeconds);
                remainingTime = Math.max(0, totalSeconds - completedTime);
            }

            completed.style.width = completedVal.toString() + '%';
            remaining.style.width = remainingVal.toString() + '%';
            timeCompleted.innerText = formatTime(completedTime);
            timeRemaining.innerText = formatTime(remainingTime);

            if (percentage >= 1 && shouldShow) {
                triggerFinishedReading();
            } else {
                triggerStillReading();
            }

            lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
        }

        window.addEventListener('scroll', updateTimeBar, { passive: true });
        window.addEventListener('resize', updateTimeBar);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', updateTimeBar);
        }

        updateTimeBar();
    }

    function triggerStillReading() {
        var readEvent = document.createEvent('CustomEvent');
        readEvent.initCustomEvent('stillReading');
        document.dispatchEvent(readEvent);
    }

    function triggerFinishedReading() {
        var readEvent = document.createEvent('CustomEvent');
        readEvent.initCustomEvent('finishedReading');
        document.dispatchEvent(readEvent);
    }
})();
