class ContentCreator:
    def __init__(self, creator_name, followers_count):
        self.creator_name = creator_name
        self.followers_count = followers_count

    def show_profile(self):
        print(f"Account: {self.creator_name}, Followers: {self.followers_count}")

class YouTubeChannel(ContentCreator):
    def __init__(self, creator_name, followers_count, video_count):
        super().__init__(creator_name, followers_count)
        self.video_count = video_count

    def upload_video(self):
        self.video_count += 1
        print(f"Uploading video! Total videos now: {self.video_count}")

class SnapchatAccount(ContentCreator):
    def __init__(self, creator_name, followers_count, filter_name):
        super().__init__(creator_name, followers_count)
        self.filter_name = filter_name
    def post_story(self):
        print(f"Posting story using {self.filter_name} filter")



yt = YouTubeChannel(creator_name="Ahmed Pro", followers_count=105000, video_count=5)
yt.show_profile()
yt.upload_video()

print("-" * 30)


snap = SnapchatAccount(creator_name="Ahmed Live", followers_count=2500, filter_name="Anime")
snap.show_profile()
snap.post_story()




