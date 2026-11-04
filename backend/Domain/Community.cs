namespace Foliant.Api.Domain;

/// <summary>Scheduling poll: the GM proposes dates, everyone answers yes / maybe / no per date.</summary>
public class SchedulePoll : ICampaignOwned
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string CreatedByUserId { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    /// <summary>The date the GM fixed; set = poll closed.</summary>
    public int? ChosenOptionId { get; set; }
    public List<PollOption> Options { get; set; } = new();
}

public class PollOption
{
    public int Id { get; set; }
    public int PollId { get; set; }
    public DateTime StartsAt { get; set; }
    public List<PollVote> Votes { get; set; } = new();
}

public class PollVote
{
    public int Id { get; set; }
    public int OptionId { get; set; }
    public string UserId { get; set; } = "";
    /// <summary>"yes" | "maybe" | "no"</summary>
    public string Answer { get; set; } = "yes";
}

/// <summary>One line in the group chat.</summary>
public class ChatMessage : ICampaignOwned
{
    public int Id { get; set; }
    public int CampaignId { get; set; }
    public string UserId { get; set; } = "";
    public string UserName { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>A browser/device registered for Web Push.</summary>
public class PushDevice
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Endpoint { get; set; } = "";
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
}
