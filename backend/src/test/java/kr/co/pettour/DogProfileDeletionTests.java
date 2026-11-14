package kr.co.pettour;
import java.nio.file.*;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

class DogProfileDeletionTests {
    @TempDir Path root;
    final ObjectMapper mapper = new ObjectMapper();
    @Test void deletesOnlyOwnersSelectedDogAndPersistsEmptyLists() throws Exception {
        Path file = root.resolve("members.json");
        var store = new MemberStore(mapper,file.toString());
        var owner = store.signIn(new KakaoLoginClient.User(101L,"소유자")).member();
        var other = store.signIn(new KakaoLoginClient.User(102L,"다른소유자")).member();
        var first = store.saveDog(owner,null,new MemberStore.DogInput("보리",20),false);
        var second = store.saveDog(owner,null,new MemberStore.DogInput("두부",30),false);
        var neighbors = store.saveDog(other,null,new MemberStore.DogInput("콩이",40),false);
        assertEquals(404,assertThrows(ResponseStatusException.class,()->store.deleteDog(other,first.id())).getStatusCode().value());
        assertEquals(2,store.dogs(owner).size());
        store.hideDogSetup(owner);
        store.deleteDog(owner,first.id());
        assertEquals(java.util.List.of(second),store.dogs(owner));
        assertEquals(java.util.List.of(neighbors),store.dogs(other));
        var reopened = new MemberStore(mapper,file.toString());
        assertEquals(java.util.List.of(second),reopened.dogs(owner));
        assertFalse(reopened.showDogSetup(owner));
        reopened.deleteDog(owner,second.id());
        reopened = new MemberStore(mapper,file.toString());
        assertTrue(reopened.dogs(owner).isEmpty());
        assertNotNull(reopened.find(owner.id()));
        assertEquals(java.util.List.of(neighbors),reopened.dogs(other));
    }
    @Test void failedPersistenceKeepsDogInMemory() throws Exception {
        Path file = root.resolve("members.json");
        var store = new MemberStore(mapper,file.toString());
        var owner = store.signIn(new KakaoLoginClient.User(103L,"소유자")).member();
        var dog = store.saveDog(owner,null,new MemberStore.DogInput("보리",20),false);
        Files.delete(file); Files.createDirectory(file); Files.writeString(file.resolve("blocker"),"block replacement");
        assertThrows(IOException.class,()->store.deleteDog(owner,dog.id()));
        assertEquals(java.util.List.of(dog),store.dogs(owner));
    }
}
