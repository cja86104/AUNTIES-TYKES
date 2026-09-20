// vite.config.ts
import { defineConfig } from "file:///sessions/rcw-013dtzvylxg8xfwf3glu1lpn/mnt/AUNTIES-TYKES/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/rcw-013dtzvylxg8xfwf3glu1lpn/mnt/AUNTIES-TYKES/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        /*
         * Keep the large, rarely-changing libraries in their own files so a
         * content hash change in app code does not force a re-download of
         * everything, and so recharts only ships to the admin dashboard.
         */
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
          "vendor-motion": ["framer-motion"],
          "vendor-markdown": ["react-markdown"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"]
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvcmN3LTAxM2R0enZ5bHhnOHhmd2YzZ2x1MWxwbi9tbnQvQVVOVElFUy1UWUtFU1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL3Jjdy0wMTNkdHp2eWx4Zzh4ZndmM2dsdTFscG4vbW50L0FVTlRJRVMtVFlLRVMvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL3Jjdy0wMTNkdHp2eWx4Zzh4ZndmM2dsdTFscG4vbW50L0FVTlRJRVMtVFlLRVMvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIGJ1aWxkOiB7XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIC8qXG4gICAgICAgICAqIEtlZXAgdGhlIGxhcmdlLCByYXJlbHktY2hhbmdpbmcgbGlicmFyaWVzIGluIHRoZWlyIG93biBmaWxlcyBzbyBhXG4gICAgICAgICAqIGNvbnRlbnQgaGFzaCBjaGFuZ2UgaW4gYXBwIGNvZGUgZG9lcyBub3QgZm9yY2UgYSByZS1kb3dubG9hZCBvZlxuICAgICAgICAgKiBldmVyeXRoaW5nLCBhbmQgc28gcmVjaGFydHMgb25seSBzaGlwcyB0byB0aGUgYWRtaW4gZGFzaGJvYXJkLlxuICAgICAgICAgKi9cbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgJ3ZlbmRvci1yZWFjdCc6IFsncmVhY3QnLCAncmVhY3QtZG9tJywgJ3JlYWN0LXJvdXRlci1kb20nXSxcbiAgICAgICAgICAndmVuZG9yLWNoYXJ0cyc6IFsncmVjaGFydHMnXSxcbiAgICAgICAgICAndmVuZG9yLW1vdGlvbic6IFsnZnJhbWVyLW1vdGlvbiddLFxuICAgICAgICAgICd2ZW5kb3ItbWFya2Rvd24nOiBbJ3JlYWN0LW1hcmtkb3duJ10sXG4gICAgICAgICAgJ3ZlbmRvci1mb3Jtcyc6IFsncmVhY3QtaG9vay1mb3JtJywgJ0Bob29rZm9ybS9yZXNvbHZlcnMnLCAnem9kJ10sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEwVixTQUFTLG9CQUFvQjtBQUN2WCxPQUFPLFdBQVc7QUFFbEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLE9BQU87QUFBQSxJQUNMLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFNTixjQUFjO0FBQUEsVUFDWixnQkFBZ0IsQ0FBQyxTQUFTLGFBQWEsa0JBQWtCO0FBQUEsVUFDekQsaUJBQWlCLENBQUMsVUFBVTtBQUFBLFVBQzVCLGlCQUFpQixDQUFDLGVBQWU7QUFBQSxVQUNqQyxtQkFBbUIsQ0FBQyxnQkFBZ0I7QUFBQSxVQUNwQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsdUJBQXVCLEtBQUs7QUFBQSxRQUNsRTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
