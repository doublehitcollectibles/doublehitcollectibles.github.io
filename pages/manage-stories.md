---
layout: page
title: Manage Stories
description: Secure admin workspace for Double Hit Collectibles stories and articles.
permalink: /manage-stories/
page_class: collection-page story-admin-page
---

<section
  class="collection-app story-admin-app"
  data-story-admin-app
  data-api-base="{{ site.pokemon_api_base_url | default: '' }}"
  data-story-template-url="{{ '/story/' | relative_url }}"
>
  <header class="collection-hero story-admin-hero">
    <p class="collection-eyebrow">Story Admin</p>
    <h1>Create Stories + Articles</h1>
    <p class="collection-lead">
      Draft, preview, publish, and update story pages using the same admin session that protects the collection workspace.
    </p>
    <div class="collection-status" data-story-admin-status>
      Checking admin session...
    </div>
    <div class="collection-hero-actions">
      <a class="collection-action-link" href="{{ '/collection/' | relative_url }}">View Collection</a>
      <a class="collection-action-link" href="{{ '/manage-collection/' | relative_url }}">Collection Admin</a>
    </div>
  </header>

  <section class="collection-grid-wrap collection-admin-card story-auth-card" data-story-auth-card>
    <div class="collection-section-heading">
      <div>
        <h2>Admin Only</h2>
        <p>
          Story creation is hidden until an admin session is active. Sign in through the existing admin workspace, then
          reopen the menu to create or edit articles.
        </p>
      </div>
    </div>
    <div class="collection-admin-actions">
      <a class="collection-action-link" href="{{ '/manage-collection/?required=1' | relative_url }}">Sign In</a>
    </div>
  </section>

  <section class="story-admin-workspace" data-story-admin-workspace hidden>
    <section class="collection-grid-wrap collection-admin-card">
      <div class="collection-section-heading">
        <div>
          <h2>Writer Workspace</h2>
          <p data-story-admin-session>Signed in.</p>
        </div>
        <div class="collection-hero-actions">
          <a class="collection-action-link" data-story-public-link href="{{ '/story/' | relative_url }}" hidden>
            Open Published Story
          </a>
          <button class="collection-action-link collection-action-link--button" type="button" data-story-new>
            New Story
          </button>
        </div>
      </div>
      <div class="collection-admin-feedback" data-story-admin-feedback hidden></div>
    </section>

    <div class="story-admin-layout">
      <section class="collection-admin-panel story-admin-library">
        <div class="collection-section-heading">
          <div>
            <h2>Stories</h2>
            <p>Published stories can be opened by slug. Drafts stay in the admin workspace until you publish them.</p>
          </div>
        </div>
        <div class="collection-admin-list story-admin-list" data-story-list>
          Loading stories...
        </div>
      </section>

      <section class="collection-admin-panel story-admin-editor">
        <div class="collection-section-heading">
          <div>
            <h2 data-story-form-title>New Story</h2>
            <p>Upload a hero image or GIF, write in lightweight Markdown, and preview the article before publishing.</p>
          </div>
        </div>

        <form class="collection-admin-form story-form" data-story-form>
          <input type="hidden" name="storyId" />
          <input type="hidden" name="heroMediaId" />

          <div class="collection-admin-form-grid">
            <label class="collection-admin-field">
              <span>Title</span>
              <input type="text" name="title" maxlength="140" placeholder="Pulling a chase card in the wild" required />
            </label>
            <label class="collection-admin-field">
              <span>Slug</span>
              <input type="text" name="slug" maxlength="120" placeholder="pulling-a-chase-card" />
            </label>
          </div>

          <label class="collection-admin-field">
            <span>Subtitle</span>
            <input type="text" name="subtitle" maxlength="260" placeholder="A short line that appears below the title." />
          </label>

          <label class="collection-admin-field">
            <span>Description</span>
            <textarea
              name="description"
              rows="3"
              maxlength="420"
              placeholder="Short summary for the story list and previews."
            ></textarea>
          </label>

          <div class="collection-admin-form-grid">
            <label class="collection-admin-field">
              <span>Status</span>
              <select name="status">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label class="collection-admin-field">
              <span>Hero Alt Text</span>
              <input type="text" name="heroAlt" maxlength="420" placeholder="Describe the hero image." />
            </label>
          </div>

          <label class="collection-admin-field story-file-field">
            <span>Hero Image or GIF</span>
            <input type="file" name="heroFile" accept="image/png,image/jpeg,image/webp,image/gif" />
          </label>

          <div class="collection-admin-actions">
            <button type="button" data-story-upload-hero>Upload Hero</button>
            <button type="button" class="collection-admin-secondary" data-story-clear-hero>Clear Hero</button>
          </div>

          <label class="collection-admin-field">
            <span>Body Markdown</span>
            <textarea
              name="bodyMarkdown"
              rows="16"
              placeholder="Write the article. Use ## headings, **bold**, links, and uploaded images."
              required
            ></textarea>
          </label>

          <div class="story-inline-media">
            <label class="collection-admin-field story-file-field">
              <span>Insert Image or GIF Into Body</span>
              <input type="file" name="inlineFile" accept="image/png,image/jpeg,image/webp,image/gif" />
            </label>
            <label class="collection-admin-field">
              <span>Inline Alt Text</span>
              <input type="text" name="inlineAlt" maxlength="420" placeholder="Describe the inserted media." />
            </label>
            <div class="collection-admin-actions">
              <button type="button" data-story-insert-media>Upload + Insert</button>
            </div>
          </div>

          <div class="collection-admin-actions">
            <button type="submit" data-story-submit>Save Story</button>
            <button type="button" class="collection-admin-secondary" data-story-preview-button>Refresh Preview</button>
            <button type="button" class="collection-admin-danger" data-story-delete hidden>Delete</button>
          </div>
        </form>
      </section>
    </div>

    <section class="story-template-shell story-admin-preview">
      <div class="collection-section-heading">
        <div>
          <h2>Read Now Preview</h2>
          <p>This mirrors the public article template readers will see after you publish.</p>
        </div>
      </div>
      <article class="story-template-post" data-story-preview>
        <p class="post-info">
          <span data-story-preview-date>Draft preview</span>
          <span data-story-preview-minutes>1 min read</span>
        </p>
        <h1 class="post-title" data-story-preview-title>Untitled Story</h1>
        <p class="post-subtitle" data-story-preview-subtitle>Add a subtitle to shape the hook.</p>
        <img class="post-cover story-template-cover" data-story-preview-cover alt="" hidden />
        <div class="story-rendered-body" data-story-preview-body>
          <p>Start writing and your preview will appear here.</p>
        </div>
      </article>
    </section>
  </section>
</section>
