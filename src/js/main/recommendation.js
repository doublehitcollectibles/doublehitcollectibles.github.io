(function () {
    'use strict';

    var recommendation = document.querySelector('.recommendation');
    var isVisible = false;
    var showTimer = null;

    if (recommendation) {
        function showRecommendation() {
            recommendation.classList.add('is-visible');
            isVisible = true;
        }

        function hideRecommendation() {
            recommendation.classList.remove('is-visible');
            isVisible = false;
        }

        function clearShowTimer() {
            if (showTimer) {
                clearTimeout(showTimer);
                showTimer = null;
            }
        }

        // Back to top button
        var goBackToTop = recommendation.querySelector('.message button');
        goBackToTop.addEventListener('click', function () {
            scrollToTop();
            return false;
        });

        // Hide
        document.addEventListener('stillReading', function (elem) {
            clearShowTimer();
            if (isVisible) {
                hideRecommendation();
            }
        }, false);

        // Show
        document.addEventListener('finishedReading', function (elem) {
            if (!isVisible) {
                clearShowTimer();
                showTimer = setTimeout(function () {
                    showRecommendation();
                    showTimer = null;
                }, 220);
            }
        }, false);
    }

    var timeOut;
    function scrollToTop() {
        if (document.body.scrollTop != 0 || document.documentElement.scrollTop != 0) {
            window.scrollBy(0, -50);
            timeOut = setTimeout(scrollToTop, 10);
        }
        else clearTimeout(timeOut);
    }
})();
