// scrollstack.js — a dependency-free port of the Reactbits <ScrollStack>.
// As the container scrolls, each card pins near the top and scales down a touch
// as the next one slides over it, producing a stacked-cards effect. The React
// version uses Lenis for smooth scrolling; here we just listen to native scroll
// (rAF-throttled) and apply the same pin / scale transforms.
(function () {
  function parsePct(value, containerHeight) {
    if (typeof value === "string" && value.indexOf("%") !== -1) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return parseFloat(value);
  }

  function progress(scrollTop, start, end) {
    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / (end - start);
  }

  function init(scroller, opts) {
    opts = opts || {};
    var itemDistance = opts.itemDistance != null ? opts.itemDistance : 100;
    var itemScale = opts.itemScale != null ? opts.itemScale : 0.03;
    var itemStackDistance = opts.itemStackDistance != null ? opts.itemStackDistance : 30;
    var stackPosition = opts.stackPosition != null ? opts.stackPosition : "20%";
    var scaleEndPosition = opts.scaleEndPosition != null ? opts.scaleEndPosition : "10%";
    var baseScale = opts.baseScale != null ? opts.baseScale : 0.85;
    var rotationAmount = opts.rotationAmount != null ? opts.rotationAmount : 0;

    var cards = Array.prototype.slice.call(scroller.querySelectorAll(".scroll-stack-card"));
    var endEl = scroller.querySelector(".scroll-stack-end");
    var lastTransforms = new Map();
    var ticking = false;

    cards.forEach(function (card, i) {
      if (i < cards.length - 1) card.style.marginBottom = itemDistance + "px";
      card.style.willChange = "transform";
      card.style.transformOrigin = "top center";
    });

    function update() {
      ticking = false;
      var scrollTop = scroller.scrollTop;
      var H = scroller.clientHeight;
      var stackPx = parsePct(stackPosition, H);
      var scaleEndPx = parsePct(scaleEndPosition, H);
      var endTop = endEl ? endEl.offsetTop : 0;

      cards.forEach(function (card, i) {
        var cardTop = card.offsetTop;
        var triggerStart = cardTop - stackPx - itemStackDistance * i;
        var triggerEnd = cardTop - scaleEndPx;
        var pinStart = triggerStart;
        var pinEnd = endTop - H / 2;

        var scaleProgress = progress(scrollTop, triggerStart, triggerEnd);
        var targetScale = baseScale + i * itemScale;
        var scale = 1 - scaleProgress * (1 - targetScale);
        var rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;

        var translateY = 0;
        if (scrollTop >= pinStart && scrollTop <= pinEnd) {
          translateY = scrollTop - cardTop + stackPx + itemStackDistance * i;
        } else if (scrollTop > pinEnd) {
          translateY = pinEnd - cardTop + stackPx + itemStackDistance * i;
        }

        var tf =
          "translate3d(0," + translateY.toFixed(2) + "px,0) scale(" +
          scale.toFixed(3) + ") rotate(" + rotation.toFixed(2) + "deg)";
        if (lastTransforms.get(i) !== tf) {
          card.style.transform = tf;
          lastTransforms.set(i, tf);
        }
      });
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();

    return {
      update: update,
      destroy: function () {
        scroller.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      },
    };
  }

  window.ScrollStack = { init: init };
})();
