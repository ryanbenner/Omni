<script setup lang="ts">
</script>

<template>
  <main class="app">
    <p class="empty-hint">No file loaded</p>
  </main>
</template>

<style>
:root {
  color-scheme: dark;
}
body {
  margin: 0;
  background: #111;
  color: #ddd;
  font-family: system-ui, sans-serif;
}
.app {
  display: flex;
  height: 100vh;
  align-items: center;
  justify-content: center;
}
.empty-hint {
  color: #777;
}
</style>
