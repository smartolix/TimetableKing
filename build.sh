#!/bin/sh
cd "$(dirname "$0")"
{
  echo '<title>Stundenwerk</title>'
  echo '<meta name="claude:viewport-fit-sides" content="cover">'
  echo '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">'
  echo '<style>'; cat app.css; echo '</style>'
  cat shell.html
  echo '<script id="solver-src">'; cat solver.js; echo '</script>'
  echo '<script>'; cat model.js sample_placements.js; echo '</script>'
  echo '<script>(function () {'; echo "'use strict';"; cat src/core.js src/plan.js src/lists.js src/rules.js src/subs.js src/misc.js; echo '})();</script>'
} > index.html
